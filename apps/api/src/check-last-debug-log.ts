import * as fs from "fs";

function main() {
  const logPath = "/Users/shafinoid/Documents/wp-sites/wp1/app/public/wp-content/debug.log";
  if (!fs.existsSync(logPath)) {
    console.log("No debug.log found");
    return;
  }
  const content = fs.readFileSync(logPath, "utf-8");
  const lines = content.split("\n");
  const last100 = lines.slice(-100);
  console.log("LAST_100_LINES:\n", last100.join("\n"));
}

main();
