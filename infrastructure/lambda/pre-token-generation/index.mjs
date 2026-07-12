import pg from "pg";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const { Client } = pg;
const smClient = new SecretsManagerClient({});

// Cache the secret to avoid fetching on every invocation
let cachedPassword = null;

async function getDbPassword() {
  if (cachedPassword) return cachedPassword;

  // Fallback: if DB_PASSWORD env var is set directly (dev/testing), use it
  if (process.env.DB_PASSWORD) {
    cachedPassword = process.env.DB_PASSWORD;
    return cachedPassword;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) throw new Error("DB_SECRET_ARN not configured");

  const response = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  const secret = JSON.parse(response.SecretString);
  cachedPassword = secret.password;
  return cachedPassword;
}

export async function handler(event) {
  const email = event.request.userAttributes.email;

  try {
    const password = await getDbPassword();

    const client = new Client({
      host: process.env.DB_ENDPOINT,
      port: 5432,
      database: "dutyhub",
      user: "dutyhub_admin",
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    await client.connect();

    // Query clinic IDs for this user
    const result = await client.query(
      `SELECT "ClinicId"::text, "Role"::int
       FROM "UserClinicRoles" ucr
       JOIN "Users" u ON u."Id" = ucr."UserId"
       WHERE u."Email" = $1`,
      [email]
    );

    await client.end();

    // Build clinicIds array and roles
    const clinicIds = result.rows.map((r) => r.ClinicId);
    const roles = [...new Set(result.rows.map((r) => mapRole(r.Role)))];

    // Inject custom claims into the token
    event.response = {
      claimsAndScopeOverrideDetails: {
        idTokenGeneration: {
          claimsToAddOrOverride: {
            clinicIds: JSON.stringify(clinicIds),
            roles: JSON.stringify(roles),
          },
        },
        accessTokenGeneration: {
          claimsToAddOrOverride: {
            clinicIds: JSON.stringify(clinicIds),
            roles: JSON.stringify(roles),
          },
        },
      },
    };
  } catch (error) {
    console.error("Pre-token generation error:", error);
    // Don't block login if Lambda fails — just skip custom claims
  }

  return event;
}

function mapRole(roleInt) {
  const roles = {
    0: "Medico",
    1: "Enfermeiro",
    2: "Tecnico",
    3: "AdminClinica",
    4: "AdminGlobal",
  };
  return roles[roleInt] || "Unknown";
}
