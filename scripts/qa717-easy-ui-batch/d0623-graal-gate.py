#!/usr/bin/env python3
import subprocess, textwrap, pathlib, tempfile, sys
REPO = pathlib.Path(__file__).resolve().parents[2]
lib = pathlib.Path("/Users/matt/.maestro/lib")
cp = ":".join(sorted(str(p) for p in lib.glob("*.jar")))
java = textwrap.dedent(
    """
import javax.script.*;
import java.nio.file.*;
public class D0623Graal {
  public static void main(String[] a) throws Exception {
    ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
    if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
    if (eng == null) { System.out.println("NO_JS_ENGINE"); System.exit(2); }
    Bindings b = eng.createBindings();
    String[][] kv = {
      {"MAESTRO_D0623_PROJECT_ID","12"},{"MAESTRO_D0623_ASSIGNMENT_ID","1183"},
      {"MAESTRO_FIXTURE_CHAPTER_ID","1183"},{"MAESTRO_D0623_USER_ID","10"},
      {"MAESTRO_D0623_CACHED_IDS","10,9,12"},{"MAESTRO_D0623_SERIAL","emulator-5554"},
      {"MAESTRO_HOST_MIC_DISABLED_VERIFIED","1"},{"MAESTRO_D0623_APP_MIC_GRANTED_VERIFIED","1"},
      {"MAESTRO_D0623_EMPTY_RANGE_VERIFIED","1"},{"MAESTRO_D0623_RANGE_ATTESTATION","fcbh-1peter1-s3-p1-v13-16"},
      {"MAESTRO_D0623_CONTEXT_VERIFIED","1"}
    };
    for (String[] p : kv) b.put(p[0], p[1]);
    b.put("output", eng.eval("new Object()"));
    eng.setBindings(b, ScriptContext.ENGINE_SCOPE);
    eng.eval(Files.readString(Path.of(a[0])));
    System.out.println("ENGINE="+eng.getFactory().getEngineName());
    System.out.println("OK_RANGE="+eng.eval("output.d0623StartVerse+'-'+output.d0623EndVerse"));
    System.out.println("OK_CARD="+eng.eval("output.d0623CardTextRe"));
  }
}
"""
)
td = pathlib.Path(tempfile.mkdtemp())
(td / "D0623Graal.java").write_text(java)
subprocess.check_call(["javac", "-cp", cp, str(td / "D0623Graal.java")])
script = REPO / ".maestro/shared/scripts/d0623-pericope-delete-cancel-values.js"
r = subprocess.run(
    [
        "java",
        "-cp",
        f"{td}:{cp}",
        "-Dpolyglot.engine.WarnInterpreterOnly=false",
        "D0623Graal",
        str(script),
    ],
    capture_output=True,
    text=True,
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
