import { Hono } from "hono";

export { Room } from "./room";

type Env = {
  Bindings: {
    ROOM: DurableObjectNamespace;
  };
};

const app = new Hono<Env>();

app.get("/ws/:roomId", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  const roomId = c.req.param("roomId");
  const id = c.env.ROOM.idFromName(roomId);
  const stub = c.env.ROOM.get(id);

  return stub.fetch(c.req.raw);
});

export default app;
