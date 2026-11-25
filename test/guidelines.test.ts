import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

// The fixture is mutated freely by each test, so it is deliberately untyped.
type Fixture = Record<string, any>;

async function lint(path: string): Promise<string[]> {
  const output = await $`bun --bun redocly lint ${path} --config=redocly.yaml --format=json`.nothrow().quiet().text();
  const report: { problems: { ruleId: string }[] } = JSON.parse(output);
  return report.problems.map((problem) => problem.ruleId);
}

async function lintDocument(document: Fixture): Promise<string[]> {
  const path = join(await mkdtemp(join(tmpdir(), "journal-spec-")), "openapi.json");
  await Bun.write(path, JSON.stringify(document));
  return lint(path);
}

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const problem = (...schemas: string[]) => ({
  content: {
    "application/problem+json": {
      schema: schemas.length === 1 ? schemaRef(schemas[0]) : { anyOf: schemas.map(schemaRef) },
    },
  },
});

function compliantDocument(): Fixture {
  return {
    openapi: "3.1.0",
    info: { title: "Fixture", version: "1.0.0", description: "Fixture." },
    servers: [{ url: "https://api.journal.test" }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: "Tasks", description: "Tasks." }],
    paths: {
      "/devices": {
        post: {
          tags: ["Tasks"],
          summary: "Log in",
          operationId: "createDevice",
          security: [],
          parameters: [{ $ref: "#/components/parameters/ContractVersion" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/TaskInput" } } },
          },
          responses: {
            201: {
              description: "Logged in.",
              headers: { "Contract-Version": { $ref: "#/components/headers/ContractVersion" } },
              content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            415: { $ref: "#/components/responses/UnsupportedMediaType" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/tasks": {
        post: {
          tags: ["Tasks"],
          summary: "Create a Task",
          operationId: "createTask",
          parameters: [{ $ref: "#/components/parameters/ContractVersion" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/TaskInput" } } },
          },
          responses: {
            201: {
              description: "Created.",
              headers: { "Contract-Version": { $ref: "#/components/headers/ContractVersion" } },
              content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            415: { $ref: "#/components/responses/UnsupportedMediaType" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/tasks/{id}": {
        get: {
          tags: ["Tasks"],
          summary: "Get a Task",
          operationId: "getTask",
          parameters: [
            { $ref: "#/components/parameters/ContractVersion" },
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: {
              description: "The Task.",
              headers: { "Contract-Version": { $ref: "#/components/headers/ContractVersion" } },
              content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            404: { $ref: "#/components/responses/NotFound" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      parameters: {
        ContractVersion: {
          name: "Contract-Version",
          in: "header",
          required: true,
          description: "Contract version.",
          schema: { type: "string" },
        },
      },
      headers: {
        ContractVersion: { description: "Contract version.", required: true, schema: { type: "string" } },
      },
      schemas: {
        Task: { type: "object", properties: { id: { type: "integer" }, created_at: { type: "string" } } },
        TaskInput: { type: "object", additionalProperties: false, properties: { title: { type: "string" } } },
        Problem: { type: "object", properties: { type: { type: "string" } } },
        ValidationProblem: { type: "object", properties: { type: { type: "string" } } },
        ContractVersionProblem: { type: "object", properties: { type: { type: "string" } } },
      },
      responses: Object.fromEntries(
        [
          ["BadRequest", ["ValidationProblem", "ContractVersionProblem"]],
          ["Unauthorized", ["Problem"]],
          ["NotFound", ["Problem"]],
          ["UnsupportedMediaType", ["Problem"]],
          ["InternalServerError", ["Problem"]],
        ].map(([name, schemas]) => [
          name,
          {
            description: name,
            headers: { "Contract-Version": { $ref: "#/components/headers/ContractVersion" } },
            ...problem(...schemas),
          },
        ]),
      ),
    },
  };
}

async function violations(mutate: (document: Fixture) => unknown): Promise<string[]> {
  const document = compliantDocument();
  mutate(document);
  return lintDocument(document);
}

describe("guidelines", () => {
  it("accept the Journal API contract", async () => {
    expect(await lint("openapi.yaml")).toEqual([]);
  });

  it("accept the compliant fixture", async () => {
    expect(await lintDocument(compliantDocument())).toEqual([]);
  });

  it("G-01 rejects an error response that is not problem details", async () => {
    const ids = await violations(
      (document) => (document.components.responses.NotFound.content = { "application/json": problem("Problem").content["application/problem+json"] }),
    );
    expect(ids).toContain("rule/g01-problem-details");
  });

  it("G-01 rejects problem details with a schema other than a Problem", async () => {
    const ids = await violations(
      (document) => (document.components.responses.NotFound.content["application/problem+json"].schema = schemaRef("Task")),
    );
    expect(ids).toContain("journal/g01-problem-schema");
  });

  it("G-01 rejects problem schemas combined with oneOf", async () => {
    const ids = await violations((document) => {
      const content = document.components.responses.BadRequest.content["application/problem+json"];
      content.schema = { oneOf: content.schema.anyOf };
    });
    expect(ids).toContain("journal/g01-problem-schema");
  });

  it("G-02 rejects a secured operation without 401", async () => {
    const ids = await violations((document) => delete document.paths["/tasks/{id}"].get.responses[401]);
    expect(ids).toContain("journal/g02-unauthorized");
  });

  it("G-03 rejects an operation without 500", async () => {
    const ids = await violations((document) => delete document.paths["/tasks"].post.responses[500]);
    expect(ids).toContain("rule/g03-internal-server-error");
  });

  it("G-04 rejects a request body schema that allows unknown fields", async () => {
    const ids = await violations((document) => delete document.components.schemas.TaskInput.additionalProperties);
    expect(ids).toContain("journal/g04-closed-request-body");
  });

  it("G-05 rejects an operation with a request body but without 415", async () => {
    const ids = await violations((document) => delete document.paths["/tasks"].post.responses[415]);
    expect(ids).toContain("journal/g05-unsupported-media-type");
  });

  it("G-06 rejects an operation on a path with an ID but without 404", async () => {
    const ids = await violations((document) => delete document.paths["/tasks/{id}"].get.responses[404]);
    expect(ids).toContain("journal/g06-invalid-and-unknown-id");
  });

  it("G-06 rejects an upsert on a path with an ID but without 400", async () => {
    const ids = await violations((document) => {
      const { get } = document.paths["/tasks/{id}"];
      delete get.responses[400];
      delete get.responses[404];
      document.paths["/tasks/{id}"] = { put: get };
    });
    expect(ids).toContain("journal/g06-invalid-and-unknown-id");
  });

  it("G-07 rejects a response without the Contract-Version header", async () => {
    const ids = await violations((document) => delete document.paths["/tasks"].post.responses[201].headers);
    expect(ids).toContain("journal/g07-contract-version-header");
  });

  it("G-07 rejects a Contract-Version header that is not required", async () => {
    const ids = await violations((document) => delete document.components.headers.ContractVersion.required);
    expect(ids).toContain("journal/g07-contract-version-header");
  });

  it("G-08 rejects an operation without the Contract-Version parameter", async () => {
    const ids = await violations((document) => (document.paths["/tasks"].post.parameters = []));
    expect(ids).toContain("journal/g08-contract-version-parameter");
  });

  it("G-08 rejects an operation whose 400 cannot be a ContractVersionProblem", async () => {
    const ids = await violations((document) => delete document.paths["/tasks"].post.responses[400]);
    expect(ids).toContain("journal/g08-contract-version-problem");
  });

  it("G-09 rejects an operationId that is not camelCase", async () => {
    const ids = await violations((document) => (document.paths["/tasks"].post.operationId = "create_task"));
    expect(ids).toContain("rule/g09-operation-id-casing");
  });

  it("G-09 rejects a schema name that is not PascalCase", async () => {
    const ids = await violations((document) => {
      document.components.schemas.taskInput = document.components.schemas.TaskInput;
      document.paths["/tasks"].post.requestBody.content["application/json"].schema.$ref = "#/components/schemas/taskInput";
    });
    expect(ids).toContain("rule/g09-schema-name-casing");
  });

  it("G-09 rejects a property name that is not snake_case", async () => {
    const ids = await violations((document) => (document.components.schemas.Task.properties.createdAt = { type: "string" }));
    expect(ids).toContain("rule/g09-property-casing");
  });
});
