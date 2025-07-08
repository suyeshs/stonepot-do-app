import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message, type User } from "../shared";

function getFingerprint() {
  // Simple fingerprint: userAgent + local random ID
  let fp = localStorage.getItem("fingerprint");
  if (!fp) {
    fp = `${navigator.userAgent}-${nanoid(16)}`;
    localStorage.setItem("fingerprint", fp);
  }
  return fp;
}

function NameForm({ onRegistered }: { onRegistered: (user: User) => void }) {
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fingerprint = getFingerprint();
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, name }),
      });
      if (!res.ok) throw new Error("Registration failed");
      const user = await res.json();
      onRegistered(user);
    } catch (err) {
      setError("Could not register. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="row" onSubmit={handleSubmit}>
      <input
        type="text"
        name="name"
        className="ten columns my-input-text"
        placeholder="Enter your name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        autoComplete="off"
      />
      <button type="submit" className="send-message two columns" disabled={loading}>
        {loading ? "Registering..." : "Join"}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { room } = useParams();

  React.useEffect(() => {
    const fingerprint = getFingerprint();
    fetch("/whoami", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint }),
    })
      .then(async (res) => {
        if (res.ok) {
          const user = await res.json();
          setUser(user);
        }
      });
  }, []);

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        if (foundIndex === -1) {
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user === "assistant" ? "stonepot" : message.user,
              role: message.role,
            },
          ]);
        } else {
          setMessages((messages) => {
            return messages
              .slice(0, foundIndex)
              .concat({
                id: message.id,
                content: message.content,
                user: message.user === "assistant" ? "stonepot" : message.user,
                role: message.role,
              })
              .concat(messages.slice(foundIndex + 1));
          });
        }
      } else if (message.type === "update") {
        setMessages((messages) =>
          messages.map((m) =>
            m.id === message.id
              ? {
                  id: message.id,
                  content: message.content,
                  user: message.user === "assistant" ? "stonepot" : message.user,
                  role: message.role,
                }
              : m,
          ),
        );
      } else {
        setMessages(
          message.messages.map((m) => ({
            ...m,
            user: m.role === "assistant" ? "stonepot" : m.user,
          }))
        );
      }
    },
  });

  if (!user) {
    return <NameForm onRegistered={setUser} />;
  }

  return (
    <div className="chat container">
      {messages.map((message) => (
        <div key={message.id} className="row message">
          <div className="two columns user">{message.user}</div>
          <div className="ten columns">{message.content}</div>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const content = e.currentTarget.elements.namedItem(
            "content",
          ) as HTMLInputElement;
          const chatMessage: ChatMessage = {
            id: nanoid(8),
            content: content.value,
            user: user.name,
            role: "user",
          };
          setMessages((messages) => [...messages, chatMessage]);
          socket.send(
            JSON.stringify({
              type: "add",
              ...chatMessage,
            } satisfies Message),
          );
          content.value = "";
        }}
      >
        <input
          type="text"
          name="content"
          className="ten columns my-input-text"
          placeholder={`Hello ${user.name}! Type a message...`}
          autoComplete="off"
        />
        <button type="submit" className="send-message two columns">
          Send
        </button>
      </form>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
      <Route path="/:room" element={<App />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>,
);
