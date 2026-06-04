import * as fs from "fs";
import * as path from "path";

/** Persists a phone-number → conversationId mapping to a JSON file. */
export class SessionStore {
  private data: Record<string, string> = {};

  constructor(private readonly filePath: string) {
    this.load();
  }

  get(phone: string): string | undefined {
    return this.data[phone];
  }

  set(phone: string, conversationId: string): void {
    this.data[phone] = conversationId;
    this.save();
  }

  private load(): void {
    try {
      const content = fs.readFileSync(this.filePath, "utf-8");
      this.data = JSON.parse(content);
    } catch {
      // File doesn't exist yet or is invalid — start fresh.
      this.data = {};
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
