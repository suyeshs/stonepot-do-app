import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message, User } from "../shared";

const users: User[] = [];

async function handleRegister(request: Request, cf: any): Promise<Response> {
  const { fingerprint, name } = await request.json() as { fingerprint: string; name: string };
  let user = users.find((u) => u.id === fingerprint);
  if (!user) {
    user = {
      id: fingerprint,
      name,
      createdAt: new Date().toISOString(),
      cf,
    };
    users.push(user);
  }
  return new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } });
}

async function handleWhoami(request: Request): Promise<Response> {
  const { fingerprint } = await request.json() as { fingerprint: string };
  const user = users.find((u) => u.id === fingerprint);
  if (!user) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } });
}

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
    );

    // load the messages from the database
    this.messages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages`)
      .toArray() as ChatMessage[];
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content,
      )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content,
      )}`,
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    this.broadcast(message);

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message;
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage(parsed);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/register" && request.method === "POST") {
      return handleRegister(request, request.cf);
    }
    if (url.pathname === "/whoami" && request.method === "POST") {
      return handleWhoami(request);
    }
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
