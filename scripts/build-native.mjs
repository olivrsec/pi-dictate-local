import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { delimiter, dirname, join, resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const arguments_ = process.argv.slice(2);
let buildDir = resolve(root, "native", "build");
let release = false;

const nativeEnvironment = { ...process.env };
const configureEnvironmentArguments = [];
if (process.platform === "win32") {
	const gitBash = [
		join(
			process.env.ProgramFiles ?? "C:\\Program Files",
			"Git",
			"bin",
			"bash.exe",
		),
		join(
			process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
			"Git",
			"bin",
			"bash.exe",
		),
	].find((candidate) => existsSync(candidate));
	if (gitBash) {
		const gitBin = dirname(gitBash);
		const currentPath = nativeEnvironment.PATH ?? nativeEnvironment.Path;
		const mergedPath = currentPath
			? `${gitBin}${delimiter}${currentPath}`
			: gitBin;
		nativeEnvironment.PATH = mergedPath;
		nativeEnvironment.Path = mergedPath;
		// The native CMakeLists invokes bash for the pinned NeMo patch scripts.
		// Windows App's bash.exe may be the WSL launcher, so pin Git Bash when it
		// is installed. This works with both Visual Studio and Ninja generators.
		configureEnvironmentArguments.push(`-DBASH_EXECUTABLE=${gitBash}`);
	}
}

for (let index = 0; index < arguments_.length; index += 1) {
	const argument = arguments_[index];
	if (argument === "--release") {
		release = true;
	} else if (argument === "--build-dir" && arguments_[index + 1]) {
		buildDir = resolve(arguments_[++index]);
	} else {
		throw new Error(`Unknown native build argument: ${argument}`);
	}
}

mkdirSync(buildDir, { recursive: true });
const configureArguments = [
	"-S",
	resolve(root, "native"),
	"-B",
	buildDir,
	"-DCMAKE_BUILD_TYPE=Release",
	`-DPI_DICTATE_BUILD_TESTS=${release ? "OFF" : "ON"}`,
	...configureEnvironmentArguments,
];
if (process.platform === "darwin")
	configureArguments.push("-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0");
execFileSync("cmake", configureArguments, {
	stdio: "inherit",
	env: nativeEnvironment,
});

const buildArguments = ["--build", buildDir, "--parallel", "--config", "Release"];
execFileSync("cmake", buildArguments, {
	stdio: "inherit",
	env: nativeEnvironment,
});
execFileSync("cmake", ["--install", buildDir, "--config", "Release", "--prefix", resolve(root, "native", "install")], {
	stdio: "inherit",
	env: nativeEnvironment,
});
