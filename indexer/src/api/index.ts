// Ponder requires an API module. GraphQL is intentionally NOT exposed (security review / Trivy:
// @graphql-tools/utils prototype-pollution CVEs); Java reads the `tela_read` SQL views directly.
import { Hono } from "hono";

const app = new Hono();
export default app;
