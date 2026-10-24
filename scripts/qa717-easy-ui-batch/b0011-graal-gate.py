#!/usr/bin/env python3
"""Validate b0011-stage-refresh-values.js under Maestro 2.10 Graal JS jars."""
import subprocess, textwrap, pathlib, tempfile, sys

REPO = pathlib.Path(__file__).resolve().parents[2]
lib = pathlib.Path("/Users/matt/.maestro/lib")
cp = ":".join(sorted(str(p) for p in lib.glob("*.jar")))
java = textwrap.dedent(
    """
import javax.script.*;
import java.nio.file.*;
public class B0011Graal {
  public static void main(String[] a) throws Exception {
    ScriptEngine eng = new ScriptEngineManager().getEngineByName("js");
    if (eng == null) eng = new ScriptEngineManager().getEngineByName("graal.js");
    if (eng == null) { System.out.println("NO_JS_ENGINE"); System.exit(2); }
    Bindings b = eng.createBindings();
    String[][] kv = {
      {"MAESTRO_B0011_PROJECT_ID","12"},
      {"MAESTRO_B0011_MILESTONE_ID","19"},
      {"MAESTRO_B0011_ASSIGNMENT_ID","1185"},
      {"MAESTRO_FIXTURE_CHAPTER_ID","1185"},
      {"MAESTRO_FIXTURE_MILESTONE_ID","19"},
      {"MAESTRO_FIXTURE_PROJECT_ID","12"},
      {"MAESTRO_B0011_USER_ID","10"},
      {"MAESTRO_B0011_CACHED_IDS","10,9,12"},
      {"MAESTRO_B0011_SERIAL","emulator-5554"},
      {"MAESTRO_B0011_PHASE","after"},
      {"MAESTRO_B0011_EXPECT_OWNERSHIP","mine"},
      {"MAESTRO_B0011_EXPECT_STAGE_LABEL","Draft"},
      {"MAESTRO_B0011_CHAPTER_LABEL","1 Peter 3"},
      {"MAESTRO_B0011_ADMISSION","ADMITTED"},
      {"MAESTRO_B0011_OWNERSHIP_PREFLIGHT_VERIFIED","1"},
      {"MAESTRO_B0011_EMPTY_RECORDINGS_VERIFIED","1"},
      {"MAESTRO_B0011_LIVE_MUTATION_HOLD","approved-at-execution"},
      {"MAESTRO_B0011_WEB_RECEIPT_ID","web-after-harness-only"}
    };
    for (String[] p : kv) b.put(p[0], p[1]);
    b.put("output", eng.eval("new Object()"));
    eng.setBindings(b, ScriptContext.ENGINE_SCOPE);
    eng.eval(Files.readString(Path.of(a[0])));
    System.out.println("ENGINE="+eng.getFactory().getEngineName());
    System.out.println("OK_PHASE="+eng.eval("output.b0011Phase"));
    System.out.println("OK_ROW="+eng.eval("output.chapterRowIdRe"));
    System.out.println("OK_STAGE="+eng.eval("output.stageLabelRe"));
    // Negative: NOT_ADMITTED must throw
    Bindings bad = eng.createBindings();
    for (String[] p : kv) bad.put(p[0], p[1]);
    bad.put("MAESTRO_B0011_ADMISSION", "NOT_ADMITTED");
    bad.put("output", eng.eval("new Object()"));
    eng.setBindings(bad, ScriptContext.ENGINE_SCOPE);
    try {
      eng.eval(Files.readString(Path.of(a[0])));
      System.out.println("FAIL_EXPECTED_NOT_ADMITTED_THROW");
      System.exit(3);
    } catch (ScriptException e) {
      System.out.println("OK_NOT_ADMITTED_THROW");
    }
    // Negative: protected 1183
    Bindings prot = eng.createBindings();
    for (String[] p : kv) prot.put(p[0], p[1]);
    prot.put("MAESTRO_B0011_ASSIGNMENT_ID", "1183");
    prot.put("MAESTRO_FIXTURE_CHAPTER_ID", "1183");
    prot.put("output", eng.eval("new Object()"));
    eng.setBindings(prot, ScriptContext.ENGINE_SCOPE);
    try {
      eng.eval(Files.readString(Path.of(a[0])));
      System.out.println("FAIL_EXPECTED_PROTECTED_THROW");
      System.exit(4);
    } catch (ScriptException e) {
      System.out.println("OK_PROTECTED_THROW");
    }
  }
}
"""
)
td = pathlib.Path(tempfile.mkdtemp())
(td / "B0011Graal.java").write_text(java)
subprocess.check_call(["javac", "-cp", cp, str(td / "B0011Graal.java")])
script = REPO / ".maestro/shared/scripts/b0011-stage-refresh-values.js"
r = subprocess.run(
    [
        "java",
        "-cp",
        f"{td}:{cp}",
        "-Dpolyglot.engine.WarnInterpreterOnly=false",
        "B0011Graal",
        str(script),
    ],
    capture_output=True,
    text=True,
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
