#!/usr/bin/env python3
"""Gate D-0702 inline Maestro JS predicates under installed Maestro Graal jars.

Extracts actual ${...} expressions from the nested book YAML (not imitations)
and eng.eval's each fragment under Graal.js. Does NOT claim Node
d0702-hydration-branch.cjs validates runtime predicates — that classifier is
static/model-only.
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


def maestro_lib() -> pathlib.Path:
    return pathlib.Path.home() / ".maestro" / "lib"


def classpath(lib: pathlib.Path) -> str:
    jars = sorted(lib.glob("*.jar"))
    if not jars:
        raise FileNotFoundError(f"no Maestro jars under {lib}")
    return ":".join(str(p) for p in jars)


def extract_js_fragments(yaml_text: str) -> list[str]:
    """Pull Maestro-interpolated JS from ${...} (dedupe, preserve order)."""
    frags: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r"\$\{([^}]+)\}", yaml_text):
        frag = m.group(1).strip()
        if frag and frag not in seen:
            seen.add(frag)
            frags.append(frag)
    return frags


def main() -> int:
    lib = maestro_lib()
    try:
        cp = classpath(lib)
    except FileNotFoundError as exc:
        print(f"NO_MAESTRO_JARS={exc}")
        return 2

    body = NESTED.read_text(encoding="utf-8")
    frags = extract_js_fragments(body)
    # Exact fragment membership (avoid substring false-positives on the terminal OR).
    required_exact = [
        "output.d0702HydrationBranch = ''",
        "output.d0702HydrationBranch == ''",
        "output.d0702HydrationBranch = 'available'",
        "output.d0702HydrationBranch = 'unavailable'",
        "output.d0702HydrationBranch = 'empty'",
        "output.d0702HydrationBranch == 'available'",
        "output.d0702HydrationBranch == 'unavailable'",
        (
            "output.d0702HydrationBranch == 'available' || "
            "output.d0702HydrationBranch == 'unavailable' || "
            "output.d0702HydrationBranch == 'empty'"
        ),
    ]
    frag_set = set(frags)
    missing = [s for s in required_exact if s not in frag_set]
    if not any(f.startswith("typeof D0702_BOOK_ZERO") for f in frags):
        missing.append("typeof D0702_BOOK_ZERO === 'string'…")
    if missing:
        print("MISSING_FRAGMENTS=" + repr(missing))
        print("FOUND=" + repr(frags))
        return 2
    if not frags:
        print("NO_FRAGMENTS_EXTRACTED")
        return 2

    # Pass extracted fragments to Java; eng.eval each real YAML expression.
    # Env identifiers used by typeof / bare ${D0702_*} fragments are bound first.
    frags_literal = "\n".join(
        "      FRAGS.add(" + _java_string_literal(f) + ");" for f in frags
    )
    java = textwrap.dedent(
        f"""
        import javax.script.*;
        import java.util.*;
        public class D0702Graal {{
          static final List<String> FRAGS = new ArrayList<>();
          static {{
{frags_literal}
          }}
          public static void main(String[] a) throws Exception {{
            ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
            if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
            if (eng == null) {{ System.out.println("NO_JS_ENGINE"); System.exit(2); }}
            Bindings b = eng.createBindings();
            b.put("output", eng.eval("new Object()"));
            // Env strings required by extracted typeof / bare-identifier fragments.
            b.put("D0702_BOOK_ZERO", "^Matthew, 0 of 28 chapters selected$");
            b.put("D0702_BOOK_ONE", "^Matthew, 1 of 28 chapters selected$");
            b.put("D0702_EXPAND", "^Expand Matthew$");
            b.put("D0702_COLLAPSE", "^Collapse Matthew$");
            eng.setBindings(b, ScriptContext.ENGINE_SCOPE);

            int evaluated = 0;
            for (String frag : FRAGS) {{
              try {{
                eng.eval(frag);
                evaluated++;
              }} catch (ScriptException se) {{
                // Bare identifiers (env text interpolation) are values, not statements.
                Object val = b.get(frag);
                if (val == null && !b.containsKey(frag)) {{
                  System.out.println("EVAL_FAIL=" + frag);
                  System.out.println("ERR=" + se.getMessage());
                  System.exit(3);
                }}
                evaluated++;
              }}
            }}

            // Drive hydration terminal scenarios using ONLY extracted assignment /
            // condition fragment strings (no handwritten predicate copies).
            String assignUnset = null, assignAvail = null, assignUnavail = null, assignEmptyCatalog = null;
            String condUnset = null, condAvail = null, condUnavail = null, condTerminal = null;
            String typeofZero = null;
            String terminalExact =
                "output.d0702HydrationBranch == 'available' || "
                + "output.d0702HydrationBranch == 'unavailable' || "
                + "output.d0702HydrationBranch == 'empty'";
            for (String frag : FRAGS) {{
              if (frag.equals("output.d0702HydrationBranch = ''")) assignUnset = frag;
              else if (frag.equals("output.d0702HydrationBranch = 'available'")) assignAvail = frag;
              else if (frag.equals("output.d0702HydrationBranch = 'unavailable'")) assignUnavail = frag;
              else if (frag.equals("output.d0702HydrationBranch = 'empty'")) assignEmptyCatalog = frag;
              else if (frag.equals("output.d0702HydrationBranch == ''")) condUnset = frag;
              else if (frag.equals("output.d0702HydrationBranch == 'available'")) condAvail = frag;
              else if (frag.equals("output.d0702HydrationBranch == 'unavailable'")) condUnavail = frag;
              else if (frag.equals(terminalExact)) condTerminal = frag;
              else if (frag.startsWith("typeof D0702_BOOK_ZERO")) typeofZero = frag;
            }}
            if (assignUnset == null || assignAvail == null || assignUnavail == null
                || assignEmptyCatalog == null || condUnset == null || condAvail == null
                || condUnavail == null || condTerminal == null || typeofZero == null) {{
              System.out.println("MISSING_NAMED_EXTRACTED");
              System.exit(4);
            }}

            Object t0 = eng.eval(typeofZero);
            if (!Boolean.TRUE.equals(t0)) {{ System.out.println("TYPEOF_FAIL"); System.exit(5); }}

            // Empty env must fail the same typeof/length predicate.
            b.put("D0702_BOOK_ZERO", "");
            Object tEmpty = eng.eval(typeofZero);
            if (Boolean.TRUE.equals(tEmpty)) {{
              System.out.println("EMPTY_ENV_SHOULD_FAIL");
              System.exit(5);
            }}
            b.put("D0702_BOOK_ZERO", "^Matthew, 0 of 28 chapters selected$");

            eng.eval(assignUnset);
            if (!Boolean.TRUE.equals(eng.eval(condUnset))) {{
              System.out.println("UNSET_WHEN_FAIL"); System.exit(6);
            }}
            if (Boolean.TRUE.equals(eng.eval(condTerminal))) {{
              System.out.println("UNSET_MUST_FAIL_TERMINAL"); System.exit(6);
            }}

            eng.eval(assignAvail);
            if (!Boolean.TRUE.equals(eng.eval(condAvail))) {{
              System.out.println("AVAIL_WHEN_FAIL"); System.exit(6);
            }}
            if (!Boolean.TRUE.equals(eng.eval(condTerminal))) {{
              System.out.println("AVAIL_TERMINAL_FAIL"); System.exit(6);
            }}
            if (Boolean.TRUE.equals(eng.eval(condUnavail))) {{
              System.out.println("AVAIL_NOT_UNAVAIL_FAIL"); System.exit(6);
            }}

            eng.eval(assignUnavail);
            if (!Boolean.TRUE.equals(eng.eval(condUnavail))) {{
              System.out.println("UNAVAIL_WHEN_FAIL"); System.exit(6);
            }}
            if (!Boolean.TRUE.equals(eng.eval(condTerminal))) {{
              System.out.println("UNAVAIL_TERMINAL_FAIL"); System.exit(6);
            }}
            if (Boolean.TRUE.equals(eng.eval(condAvail))) {{
              System.out.println("UNAVAIL_NOT_AVAIL_FAIL"); System.exit(6);
            }}

            // Successful empty catalog is a terminal (shared footer path; no avail/unavail suite).
            eng.eval(assignEmptyCatalog);
            if (!Boolean.TRUE.equals(eng.eval(condTerminal))) {{
              System.out.println("EMPTY_CATALOG_TERMINAL_FAIL"); System.exit(6);
            }}
            if (Boolean.TRUE.equals(eng.eval(condAvail)) || Boolean.TRUE.equals(eng.eval(condUnavail))) {{
              System.out.println("EMPTY_CATALOG_NOT_AB_FAIL"); System.exit(6);
            }}

            // Non-terminal marker must not satisfy extracted terminal assertTrue.
            eng.eval("output.d0702HydrationBranch = 'loading'");
            if (Boolean.TRUE.equals(eng.eval(condTerminal))) {{
              System.out.println("LOADING_MUST_FAIL_TERMINAL"); System.exit(6);
            }}

            System.out.println("ENGINE=" + eng.getFactory().getEngineName());
            System.out.println("OK_GATE=OK");
            System.out.println("EVALUATED=" + evaluated);
            System.out.println("FRAGMENTS=" + FRAGS.size());
          }}
        }}
        """
    ).strip()

    td = pathlib.Path(tempfile.mkdtemp(prefix="d0702-graal-"))
    (td / "D0702Graal.java").write_text(java, encoding="utf-8")
    subprocess.check_call(["javac", "-cp", cp, str(td / "D0702Graal.java")])
    r = subprocess.run(
        [
            "java",
            "-cp",
            f"{td}:{cp}",
            "-Dpolyglot.engine.WarnInterpreterOnly=false",
            "D0702Graal",
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
    print("LIB=" + str(lib))
    print("EXTRACTED=" + "|".join(frags))
    return 0


def _java_string_literal(s: str) -> str:
    escaped = (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )
    return f'"{escaped}"'


if __name__ == "__main__":
    raise SystemExit(main())
