import { readFileSync } from "node:fs";
import { agentsRequest } from "../../src/lib/career/simulation/agentsApi";

/** Test-only loopback HTTPS launcher. Production driver/setup assets are imported
 * by the runtime; the only network-policy exception belongs to this fixture. */
export function ownedApplicationFixtureRequest(serverPath: string): typeof agentsRequest {
  return async (path, body, method, signal) => {
    if (path === "sessions" && body) {
      const input = structuredClone(body) as any;
      const environment = input.environment;
      if (environment?.type === "openai_hosted") {
        const start = environment.files.find((file: any) => file.path.endsWith("/start.py"));
        start.data = Buffer.from(Buffer.from(start.data, "base64").toString()
          .replace("HARPER_BROWSER_PUBLIC_NETWORK='1'", "HARPER_BROWSER_PUBLIC_NETWORK='0'"))
          .toString("base64");
        const fixture = readFileSync(serverPath, "utf8")
          .replace("http.createServer(", "require('node:https').createServer({key:fs.readFileSync('/workspace/key.pem'),cert:fs.readFileSync('/workspace/cert.pem')},")
          .replace(".listen(8765,", ".listen(443,");
        const inline = (path: string, text: string) => ({ type: "inline", path, data: Buffer.from(text).toString("base64") });
        environment.files.push(inline("/workspace/fixture.cjs", fixture));
        environment.files.push(inline("/workspace/start-fixture.py", "import subprocess\nwith open('/workspace/fixture.log','ab') as log:\n subprocess.Popen(['node','/workspace/fixture.cjs'],start_new_session=True,stdin=subprocess.DEVNULL,stdout=log,stderr=log)\n"));
        environment.setup_commands.splice(environment.setup_commands.length - 1, 0, {
          command: "openssl req -x509 -newkey rsa:2048 -nodes -keyout /workspace/key.pem -out /workspace/cert.pem -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 && cp /workspace/cert.pem /usr/local/share/ca-certificates/harper-fixture.crt && update-ca-certificates && python3 /workspace/harper-browser/trust.py && python3 /workspace/start-fixture.py",
          cwd: "/workspace",
        });
        body = input;
      }
    }
    return agentsRequest(path, body, method, signal);
  };
}
