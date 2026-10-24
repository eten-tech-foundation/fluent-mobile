#!/usr/bin/env python3
"""Validate d0188-centered-empty-values.js under Maestro 2.10 Graal JS jars."""
import subprocess, textwrap, pathlib, tempfile, sys

REPO = pathlib.Path(__file__).resolve().parents[2]
lib = pathlib.Path("/Users/matt/.maestro/lib")
cp = ":".join(sorted(str(p) for p in lib.glob("*.jar")))
java = textwrap.dedent(
    """
import javax.script.*;
import java.nio.file.*;
public class D0188Graal {
  public static void main(String[] a) throws Exception {
    ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
    if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
    if (eng == null) { System.out.println("NO_JS_ENGINE"); System.exit(2); }
    Bindings b = eng.createBindings();
    String[][] kv = {
      {"MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE","484"},
      {"MAESTRO_EXPECT_RESOURCES_EMPTY_KIND","none_for_verse"},
      {"MAESTRO_D0188_USER_ID","10"},
      {"MAESTRO_D0188_CACHED_IDS","10,9,12"},
      {"MAESTRO_D0188_SERIAL","emulator-5554"},
      {"MAESTRO_D0188_GEOMETRY_ATTESTATION","1"},
      {"MAESTRO_D0188_ONLINE_EMPTY_PRECONDITION_VERIFIED","1"},
      {"MAESTRO_D0188_AIRPLANE_OFF_VERIFIED","1"}
    };
    for (String[] p : kv) b.put(p[0], p[1]);
    b.put("output", eng.eval("new Object()"));
    eng.setBindings(b, ScriptContext.ENGINE_SCOPE);
    eng.eval(Files.readString(Path.of(a[0])));
    System.out.println("ENGINE="+eng.getFactory().getEngineName());
    System.out.println("OK_READY="+eng.eval("output.d0188GeometryReady"));
    System.out.println("OK_FIXTURE="+eng.eval("output.emptyFixture"));
    System.out.println("OK_KIND="+eng.eval("output.emptyKind"));
    System.out.println("OK_MSG_ID="+eng.eval("output.emptyMessageId"));
  }
}
"""
)
td = pathlib.Path(tempfile.mkdtemp())
(td / "D0188Graal.java").write_text(java)
subprocess.check_call(["javac", "-cp", cp, str(td / "D0188Graal.java")])
script = REPO / ".maestro/shared/scripts/d0188-centered-empty-values.js"
r = subprocess.run(
    [
        "java",
        "-cp",
        f"{td}:{cp}",
        "-Dpolyglot.engine.WarnInterpreterOnly=false",
        "D0188Graal",
        str(script),
    ],
    capture_output=True,
    text=True,
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
