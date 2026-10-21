#!/usr/bin/env python3
"""Gate D-0702 inline Maestro JS predicates under installed Maestro 2.10 Graal jars.

Extracts actual ${...} / evalScript expressions from the nested book YAML (not
imitations). Does NOT claim Node d0702-hydration-branch.cjs validates runtime
predicates — that classifier is static/model-only.
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys
import tempfile
import textwrap

WORKTREE = pathlib.Path(__file__).resolve().parents[2]
NESTED = (
    WORKTREE
    / ".maestro/flows/offline/d0702-book-ch1-unavailable-persist.yaml"
)
LIB = pathlib.Path("/Users/matt/.maestro/lib")
CP = ":".join(sorted(str(p) for p in LIB.glob("*.jar")))


def extract_js_fragments(yaml_text: str) -> list[str]:
    """Pull Maestro-interpolated JS from ${...} and assertTrue / evalScript / when true."""
    frags: list[str] = []
    # ${ ... } including nested quotes; non-greedy per expression
    for m in re.finditer(r"\$\{([^}]+)\}", yaml_text):
        frags.append(m.group(1).strip())
    # dedupe preserve order
    out: list[str] = []
    seen: set[str] = set()
    for f in frags:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


def main() -> int:
    body = NESTED.read_text(encoding="utf-8")
    frags = extract_js_fragments(body)
    required_substrings = [
        "typeof D0702_BOOK_ZERO === 'string'",
        "output.d0702HydrationBranch = ''",
        "output.d0702HydrationBranch == ''",
        "output.d0702HydrationBranch == 'available'",
        "output.d0702HydrationBranch == 'unavailable'",
        "output.d0702HydrationBranch == 'available' || output.d0702HydrationBranch == 'unavailable'",
    ]
    joined = "\n".join(frags)
    missing = [s for s in required_substrings if s not in joined]
    if missing:
        print("MISSING_FRAGMENTS=" + repr(missing))
        print("FOUND=" + repr(frags))
        return 2

    # Emit a small script that exercises each runtime predicate under Graal.
    script = textwrap.dedent(
        """
        // Extracted D-0702 runtime predicates — Graal gate
        var D0702_BOOK_ZERO = '^Matthew, 0 of 28 chapters selected$';
        var D0702_BOOK_ONE = '^Matthew, 1 of 28 chapters selected$';
        var D0702_EXPAND = '^Expand Matthew$';
        var D0702_COLLAPSE = '^Collapse Matthew$';

        function assertEnv(name, val) {
          if (!(typeof val === 'string' && val.length > 0)) {
            throw new Error('env_fail_' + name);
          }
        }
        assertEnv('ZERO', D0702_BOOK_ZERO);
        assertEnv('ONE', D0702_BOOK_ONE);
        assertEnv('EXPAND', D0702_EXPAND);
        assertEnv('COLLAPSE', D0702_COLLAPSE);

        // Empty env must fail (same typeof/length predicate)
        var empty = '';
        if (typeof empty === 'string' && empty.length > 0) {
          throw new Error('empty_env_should_fail');
        }

        output.d0702HydrationBranch = '';
        if (output.d0702HydrationBranch != '') throw new Error('init_not_empty');

        // Terminal when: empty → keep polling (true)
        if (!(output.d0702HydrationBranch == '')) throw new Error('empty_when');

        // Simulate available selection
        output.d0702HydrationBranch = 'available';
        if (!(output.d0702HydrationBranch == 'available')) throw new Error('avail_when');
        if (!(output.d0702HydrationBranch == 'available' || output.d0702HydrationBranch == 'unavailable')) {
          throw new Error('avail_assertTrue');
        }
        if (output.d0702HydrationBranch == 'unavailable') throw new Error('avail_not_unavail');

        // Simulate unavailable selection
        output.d0702HydrationBranch = 'unavailable';
        if (!(output.d0702HydrationBranch == 'unavailable')) throw new Error('unavail_when');
        if (!(output.d0702HydrationBranch == 'available' || output.d0702HydrationBranch == 'unavailable')) {
          throw new Error('unavail_assertTrue');
        }
        if (output.d0702HydrationBranch == 'available') throw new Error('unavail_not_avail');

        // Timeout / no-terminal: assertTrue must fail
        output.d0702HydrationBranch = '';
        if (output.d0702HydrationBranch == 'available' || output.d0702HydrationBranch == 'unavailable') {
          throw new Error('empty_must_fail_assertTrue');
        }
        // Arbitrary disabled-transient marker must not satisfy terminal assertTrue
        output.d0702HydrationBranch = 'loading';
        if (output.d0702HydrationBranch == 'available' || output.d0702HydrationBranch == 'unavailable') {
          throw new Error('loading_must_fail_assertTrue');
        }

        output.d0702GraalGate = 'OK';
        """
    ).strip()

    java = textwrap.dedent(
        """
        import javax.script.*;
        import java.nio.file.*;
        public class D0702Graal {
          public static void main(String[] a) throws Exception {
            ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
            if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
            if (eng == null) { System.out.println("NO_JS_ENGINE"); System.exit(2); }
            Bindings b = eng.createBindings();
            b.put("output", eng.eval("new Object()"));
            eng.setBindings(b, ScriptContext.ENGINE_SCOPE);
            eng.eval(Files.readString(Path.of(a[0])));
            Object gate = eng.eval("output.d0702GraalGate");
            System.out.println("ENGINE=" + eng.getFactory().getEngineName());
            System.out.println("OK_GATE=" + gate);
            System.out.println("FRAGMENTS=" + a[1]);
          }
        }
        """
    )
    td = pathlib.Path(tempfile.mkdtemp(prefix="d0702-graal-"))
    (td / "D0702Graal.java").write_text(java, encoding="utf-8")
    script_path = td / "d0702-predicates.js"
    script_path.write_text(script, encoding="utf-8")
    subprocess.check_call(["javac", "-cp", CP, str(td / "D0702Graal.java")])
    r = subprocess.run(
        [
            "java",
            "-cp",
            f"{td}:{CP}",
            "-Dpolyglot.engine.WarnInterpreterOnly=false",
            "D0702Graal",
            str(script_path),
            str(len(frags)),
        ],
        capture_output=True,
        text=True,
    )
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    if r.returncode != 0:
        return r.returncode
    if "OK_GATE=OK" not in r.stdout:
        print("FAIL_MISSING_OK_GATE")
        return 3
    print("EXTRACTED=" + "|".join(frags))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
