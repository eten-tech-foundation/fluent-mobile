#!/usr/bin/env python3
"""Validate b0010-pm9-taken-local-capture-values.js under Maestro Graal JS jars."""
import subprocess, textwrap, pathlib, tempfile, sys

REPO = pathlib.Path(__file__).resolve().parents[2]
lib = pathlib.Path("/Users/matt/.maestro/lib")
cp = ":".join(sorted(str(p) for p in lib.glob("*.jar")))
java = textwrap.dedent(
    """
import javax.script.*;
import java.nio.file.*;
public class B0010Graal {
  public static void main(String[] a) throws Exception {
    ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
    if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
    if (eng == null) { System.out.println("NO_JS_ENGINE"); System.exit(2); }
    Bindings b = eng.createBindings();
    String[][] kv = {
      {"MAESTRO_B0010_PROJECT_ID","12"},{"MAESTRO_FIXTURE_PROJECT_ID","12"},
      {"MAESTRO_B0010_MILESTONE_ID","19"},{"MAESTRO_FIXTURE_MILESTONE_ID","19"},
      {"MAESTRO_B0010_ASSIGNMENT_ID","1185"},{"MAESTRO_FIXTURE_CHAPTER_ID","1185"},
      {"MAESTRO_B0010_USER_ID","9"},{"MAESTRO_B0010_CACHED_IDS","10,9,12"},
      {"MAESTRO_B0010_SERIAL","emulator-5554"},
      {"MAESTRO_HOST_MIC_DISABLED_VERIFIED","1"},
      {"MAESTRO_B0010_VERSE","1"},{"MAESTRO_B0010_EMPTY_VERSE_VERIFIED","1"},
      {"MAESTRO_B0010_ADMISSION","ADMITTED"}
    };
    for (String[] p : kv) b.put(p[0], p[1]);
    b.put("output", eng.eval("new Object()"));
    eng.setBindings(b, ScriptContext.ENGINE_SCOPE);
    eng.eval(Files.readString(Path.of(a[0])));
    System.out.println("ENGINE="+eng.getFactory().getEngineName());
    System.out.println("OK_READY="+eng.eval("output.b0010Ready"));
    System.out.println("OK_CHAPTER="+eng.eval("output.chapterRowIdRe"));
    System.out.println("OK_VERSE="+eng.eval("output.verseRowIdRe"));
  }
}
"""
)
td = pathlib.Path(tempfile.mkdtemp())
(td / "B0010Graal.java").write_text(java)
subprocess.check_call(["javac", "-cp", cp, str(td / "B0010Graal.java")])
script = REPO / ".maestro/shared/scripts/b0010-pm9-taken-local-capture-values.js"
r = subprocess.run(
    [
        "java",
        "-cp",
        f"{td}:{cp}",
        "-Dpolyglot.engine.WarnInterpreterOnly=false",
        "B0010Graal",
        str(script),
    ],
    capture_output=True,
    text=True,
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
