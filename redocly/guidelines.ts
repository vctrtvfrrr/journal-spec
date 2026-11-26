type Ref = { $ref?: string; required?: boolean };

type Schema = Ref & {
  anyOf?: Schema[];
  oneOf?: Schema[];
  additionalProperties?: unknown;
};

type MediaType = { schema?: Schema };

type Response = Ref & {
  headers?: Record<string, Ref>;
  content?: Record<string, MediaType>;
};

type Operation = {
  security?: SecurityRequirement[];
  parameters?: Ref[];
  requestBody?: unknown;
  responses?: Record<string, Response>;
};

type SecurityRequirement = Record<string, string[]>;

type PathItem = Partial<Record<HttpMethod, Operation>> & { parameters?: Ref[] };

type Location = { child(path: string | (string | number)[]): Location };

type Context = {
  key: string | number;
  location: Location;
  report(problem: { message: string; location: Location }): void;
  resolve<T>(node: T): { node: T | undefined };
};

type Visitor = {
  Root?: (root: { security?: SecurityRequirement[] }, context: Context) => void;
  Operation?: (operation: Operation, context: Context) => void;
  PathItem?: (pathItem: PathItem, context: Context) => void;
  RequestBody?: (requestBody: { content?: Record<string, MediaType> }, context: Context) => void;
  Response?: (response: Response, context: Context) => void;
  MediaType?: (mediaType: MediaType, context: Context) => void;
};

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const DATA_CHANGING_METHODS: readonly HttpMethod[] = ["post", "put", "patch", "delete"];

const PROBLEM_SCHEMA = /^#\/components\/schemas\/(Problem|ValidationProblem|ContractVersionProblem)$/;
const CONTRACT_VERSION_HEADER = "#/components/headers/ContractVersion";
const CONTRACT_VERSION_PARAMETER = "#/components/parameters/ContractVersion";
const CONTRACT_VERSION_PROBLEM = "#/components/schemas/ContractVersionProblem";

function schemaRefs(schema: Schema | undefined): string[] {
  if (schema?.$ref) return [schema.$ref];
  return (schema?.anyOf ?? []).flatMap(schemaRefs);
}

function isProblemSchema(schema: Schema | undefined): boolean {
  const refs = schemaRefs(schema);
  return !schema?.oneOf && refs.length > 0 && refs.every((ref) => PROBLEM_SCHEMA.test(ref));
}

function problemSchema(): Visitor {
  return {
    MediaType(mediaType, { key, report, location }) {
      if (key !== "application/problem+json" || isProblemSchema(mediaType.schema)) return;
      report({
        message:
          "G-01: problem details use the Problem, ValidationProblem or ContractVersionProblem schema, alone or combined with anyOf.",
        location: location.child("schema"),
      });
    },
  };
}

function isSecured(operation: Operation, rootSecurity: SecurityRequirement[] | undefined): boolean {
  const requirements = operation.security ?? rootSecurity ?? [];
  return requirements.some((requirement) => Object.keys(requirement).length > 0);
}

function unauthorized(): Visitor {
  let rootSecurity: SecurityRequirement[] | undefined;
  return {
    Root(root) {
      rootSecurity = root.security;
    },
    Operation(operation, { report, location }) {
      if (!isSecured(operation, rootSecurity) || operation.responses?.["401"]) return;
      report({ message: "G-02: secured operations declare a 401 response.", location: location.child("responses") });
    },
  };
}

function closedRequestBody(): Visitor {
  return {
    RequestBody(requestBody, { report, location, resolve }) {
      for (const [mediaType, { schema }] of Object.entries(requestBody.content ?? {})) {
        if (resolve(schema).node?.additionalProperties === false) continue;
        report({
          message: "G-04: request body schemas set additionalProperties to false.",
          location: location.child(["content", mediaType, "schema"]),
        });
      }
    },
  };
}

function unsupportedMediaType(): Visitor {
  return {
    Operation(operation, { report, location }) {
      if (!operation.requestBody || operation.responses?.["415"]) return;
      report({
        message: "G-05: operations with a request body declare a 415 response.",
        location: location.child("responses"),
      });
    },
  };
}

function invalidAndUnknownId(): Visitor {
  return {
    PathItem(pathItem, { key, report, location }) {
      if (!String(key).includes("{")) return;
      for (const method of HTTP_METHODS) {
        const responses = pathItem[method]?.responses;
        const isUpsert = method === "put";
        if (!responses || (responses["400"] && (isUpsert || responses["404"]))) continue;
        report({
          message: "G-06: operations on a path with an ID declare 400, and 404 unless they are an upsert (PUT).",
          location: location.child([method, "responses"]),
        });
      }
    },
  };
}

function contractVersionHeader(): Visitor {
  return {
    Response(response, { report, location, resolve }) {
      const header = response.headers?.["Contract-Version"];
      if (header?.$ref === CONTRACT_VERSION_HEADER && resolve(header).node?.required === true) return;
      report({
        message: `G-07: every response references ${CONTRACT_VERSION_HEADER}, a required header, as its Contract-Version header.`,
        location: location.child("headers"),
      });
    },
  };
}

function contractVersionParameter(): Visitor {
  return {
    PathItem(pathItem, { report, location }) {
      const pathParameters = pathItem.parameters ?? [];
      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (!operation) continue;
        const parameters = [...pathParameters, ...(operation.parameters ?? [])];
        if (parameters.some((parameter) => parameter.$ref === CONTRACT_VERSION_PARAMETER)) continue;
        report({
          message: `G-08: every operation references ${CONTRACT_VERSION_PARAMETER}.`,
          location: location.child([method]),
        });
      }
    },
  };
}

function contractVersionProblem(): Visitor {
  return {
    Operation(operation, { report, location, resolve }) {
      const badRequest = operation.responses?.["400"] && resolve(operation.responses["400"]).node;
      const schema = badRequest?.content?.["application/problem+json"]?.schema;
      if (schemaRefs(schema).includes(CONTRACT_VERSION_PROBLEM)) return;
      report({
        message: `G-08: every operation's 400 response can be a ${CONTRACT_VERSION_PROBLEM}.`,
        location: location.child("responses"),
      });
    },
  };
}

function forbidden(): Visitor {
  return {
    PathItem(pathItem, { report, location }) {
      for (const method of DATA_CHANGING_METHODS) {
        const responses = pathItem[method]?.responses;
        if (!responses || responses["403"]) continue;
        report({
          message: "G-10: operations with POST, PUT, PATCH or DELETE declare a 403 response.",
          location: location.child([method, "responses"]),
        });
      }
    },
  };
}

export default function guidelines() {
  return {
    id: "journal",
    rules: {
      oas3: {
        "g01-problem-schema": problemSchema,
        "g02-unauthorized": unauthorized,
        "g04-closed-request-body": closedRequestBody,
        "g05-unsupported-media-type": unsupportedMediaType,
        "g06-invalid-and-unknown-id": invalidAndUnknownId,
        "g07-contract-version-header": contractVersionHeader,
        "g08-contract-version-parameter": contractVersionParameter,
        "g08-contract-version-problem": contractVersionProblem,
        "g10-forbidden": forbidden,
      },
    },
  };
}
