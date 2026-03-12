import { readFileSync } from "node:fs";
import path from "node:path";

const PACKAGE_JSON_PATH = path.resolve(process.cwd(), "package.json");
const REACT_ECOSYSTEM_PACKAGES = [
  "react",
  "react-dom",
  "@types/react",
  "@types/react-dom",
];

const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));

function getVersionRange(packageName) {
  return (
    packageJson.dependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName] ??
    null
  );
}

function extractMajor(versionRange) {
  if (!versionRange) {
    return null;
  }

  const match = String(versionRange).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

const packages = REACT_ECOSYSTEM_PACKAGES.map((name) => {
  const range = getVersionRange(name);
  return {
    name,
    range,
    major: extractMajor(range),
  };
});

const missingPackages = packages.filter(({ range }) => !range);
if (missingPackages.length > 0) {
  console.error(
    `React parity check failed: missing required package declarations (${missingPackages
      .map(({ name }) => name)
      .join(", ")}).`,
  );
  process.exit(1);
}

const unparsablePackages = packages.filter(
  ({ major }) => major === null || Number.isNaN(major),
);
if (unparsablePackages.length > 0) {
  console.error(
    `React parity check failed: unable to determine major version for (${unparsablePackages
      .map(({ name, range }) => `${name}=${range}`)
      .join(", ")}).`,
  );
  process.exit(1);
}

const uniqueMajors = [...new Set(packages.map(({ major }) => major))];
if (uniqueMajors.length > 1) {
  console.error("React major parity check failed.");
  for (const { name, range, major } of packages) {
    console.error(`- ${name}: ${range} (major ${major})`);
  }
  process.exit(1);
}

console.log(
  `React major parity check passed (major ${uniqueMajors[0]}): ${packages
    .map(({ name, range }) => `${name}@${range}`)
    .join(", ")}`,
);
