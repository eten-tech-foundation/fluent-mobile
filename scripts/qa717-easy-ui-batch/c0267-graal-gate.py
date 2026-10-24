#!/usr/bin/env python3
"""Validate c0267-ownership-visual-values.js under Maestro 2.10 Graal JS jars."""
import subprocess, textwrap, pathlib, tempfile, sys

REPO = pathlib.Path(__file__).resolve().parents[2]
lib = pathlib.Path("/Users/matt/.maestro/lib")
cp = ":".join(sorted(str(p) for p in lib.glob("*.jar")))
java = textwrap.dedent(
    """
import javax.script.*;
import java.nio.file.*;
public class C0267Graal {
  public static void main(String[] a) throws Exception {
    ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
    if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
    if (eng == null) { System.out.println("NO_JS_ENGINE"); System.exit(2); }
    Bindings b = eng.createBindings();
    String[][] kv = {
      {"MAESTRO_C0267_PROJECT_ID","12"},{"MAESTRO_FIXTURE_PROJECT_ID","12"},
      {"MAESTRO_C0267_MILESTONE_ID","19"},{"MAESTRO_FIXTURE_MILESTONE_ID","19"},
      {"MAESTRO_C0267_MINE_ASSIGNMENT_ID","1185"},
      {"MAESTRO_C0267_OTHER_ASSIGNMENT_ID","1184"},
      {"MAESTRO_C0267_USER_ID","10"},{"MAESTRO_C0267_CACHED_IDS","10,9,12"},
      {"MAESTRO_C0267_SERIAL","emulator-5554"},
      {"MAESTRO_C0267_VISUAL_ATTESTATION","p12-m19-1185mine-1184other-legacy-primary-muted"}
    };
    for (String[] p : kv) b.put(p[0], p[1]);
    b.put("output", eng.eval("new Object()"));
    eng.setBindings(b, ScriptContext.ENGINE_SCOPE);
    eng.eval(Files.readString(Path.of(a[0])));
    System.out.println("ENGINE="+eng.getFactory().getEngineName());
    System.out.println("OK_PRIMARY="+eng.eval("output.legacyPrimaryHex"));
    System.out.println("OK_MUTED="+eng.eval("output.legacyMutedHex"));
    System.out.println("OK_MINE="+eng.eval("output.mineRowIdRe"));
  }
}
"""
)
td = pathlib.Path(tempfile.mkdtemp())
(td / "C0267Graal.java").write_text(java)
subprocess.check_call(["javac", "-cp", cp, str(td / "C0267Graal.java")])
script = REPO / ".maestro/shared/scripts/c0267-ownership-visual-values.js"
r = subprocess.run(
    [
        "java",
        "-cp",
        f"{td}:{cp}",
        "-Dpolyglot.engine.WarnInterpreterOnly=false",
        "C0267Graal",
        str(script),
    ],
    capture_output=True,
    text=True,
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
