// Read-only API served by Ponder (internal network only, never published on the host).
// Java reads PostgreSQL views directly; this endpoint is for diagnostics/GraphQL.
import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";

const app = new Hono();
app.use("/graphql", graphql({ db, schema }));
export default app;
