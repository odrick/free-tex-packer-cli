const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const pkg = require("../package.json");
const { makeWorkspace, run, PROJECT_EXPORTERS } = require("./helpers");

function listFiles(dir) {
	return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function noStackTrace(result) {
	// a failure must be a readable message, not a raw Node.js crash with a stack trace
	const stackLine = /\n\s+at .*:\d+:\d+/;
	assert.doesNotMatch(result.stderr, stackLine, "stderr contains a stack trace:\n" + result.stderr);
}

let ws;
before(() => {
	ws = makeWorkspace();
});
after(() => ws.cleanup());

/** Fresh output directory for a test (kept inside the workspace, removed with it). */
let outCounter = 0;
function freshOut(create = true) {
	const dir = path.join(ws.dir, "out-" + ++outCounter);
	if (create) fs.mkdirSync(dir);
	return dir;
}

describe("packing", () => {
	it("packs a project into a texture and a data file", () => {
		const out = freshOut();
		const result = run(["--project", ws.project(), "--output", out]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(listFiles(out), ["atlas.json", "atlas.png"]);

		const data = readJson(path.join(out, "atlas.json"));
		assert.deepEqual(Object.keys(data.frames).sort(), ["blue.png", "green.png", "red.png"]);
		assert.equal(fs.readFileSync(path.join(out, "atlas.png")).subarray(1, 4).toString(), "PNG");
	});

	it("accepts --project=value and --output=value", () => {
		const out = freshOut();
		const result = run([`--project=${ws.project()}`, `--output=${out}`]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(listFiles(out), ["atlas.json", "atlas.png"]);
	});

	it("accepts relative paths", () => {
		const out = freshOut();
		ws.project();
		const result = run(["--project", "project.ftpp", "--output", path.basename(out)], { cwd: ws.dir });
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(listFiles(out), ["atlas.json", "atlas.png"]);
	});

	it("ignores options it does not know", () => {
		const out = freshOut();
		const result = run(["--project", ws.project(), "--output", out, "--verbose", "--something=1"]);
		assert.equal(result.status, 0, result.output);
	});

	it("adds the images of the project folders", () => {
		const out = freshOut();
		const result = run(["--project", ws.project({ folders: [ws.folder] }), "--output", out]);
		assert.equal(result.status, 0, result.output);
		const frames = Object.keys(readJson(path.join(out, "atlas.json")).frames).sort();
		assert.deepEqual(frames, ["blue.png", "green.png", "red.png", "ui/button.png", "ui/icon.png"]);
	});

	it("writes a jpg texture when asked", () => {
		const out = freshOut();
		const result = run(["--project", ws.project({}, { textureFormat: "jpg" }), "--output", out]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(listFiles(out), ["atlas.jpg", "atlas.json"]);
	});

	it("writes next to the project file when no output is given anywhere", () => {
		const project = ws.project();
		const result = run(["--project", project]);
		assert.equal(result.status, 0, result.output);
		assert.ok(fs.existsSync(path.join(ws.dir, "atlas.json")));
		assert.ok(fs.existsSync(path.join(ws.dir, "atlas.png")));
		fs.rmSync(path.join(ws.dir, "atlas.json"));
		fs.rmSync(path.join(ws.dir, "atlas.png"));
	});

	it("uses the savePath of the project when --output is missing", () => {
		const out = freshOut();
		const result = run(["--project", ws.project({ savePath: out })]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(listFiles(out), ["atlas.json", "atlas.png"]);
	});

	it("creates the output folder when it does not exist", () => {
		const out = path.join(freshOut(false), "nested", "deeper");
		const result = run(["--project", ws.project(), "--output", out]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(listFiles(out), ["atlas.json", "atlas.png"]);
	});
});

describe("exporters", () => {
	for (const [exporter, ext] of Object.entries(PROJECT_EXPORTERS)) {
		it(`${exporter} -> atlas.${ext}`, () => {
			const out = freshOut();
			const result = run(["--project", ws.project({}, { exporter }), "--output", out]);
			assert.equal(result.status, 0, result.output);
			assert.deepEqual(listFiles(out), ["atlas." + ext, "atlas.png"].sort());
			if (ext === "xml") {
				// the XML declaration must come first (fixed in free-tex-packer-core 0.4)
				assert.ok(fs.readFileSync(path.join(out, "atlas.xml"), "utf8").startsWith("<?xml"));
			}
		});
	}

	it("does not support a custom exporter", () => {
		const result = run(["--project", ws.project({}, { exporter: "custom" }), "--output", freshOut()]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.output, /custom exporter/i);
	});
});

describe("exit codes and error messages", () => {
	it("--help prints the usage and succeeds", () => {
		const result = run(["--help"]);
		assert.equal(result.status, 0, result.output);
		assert.match(result.stdout, /Usage/i);
		assert.match(result.stdout, /--project/);
		assert.match(result.stdout, /--output/);
	});

	it("--version prints the version and succeeds", () => {
		const result = run(["--version"]);
		assert.equal(result.status, 0, result.output);
		assert.match(result.stdout, new RegExp(pkg.version.replace(/\./g, "\\.")));
	});

	it("fails without --project", () => {
		const result = run([]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /--project/);
	});

	it("fails when --project has no value", () => {
		const result = run(["--project"]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /--project/);
	});

	it("understands the short flags -h and -v", () => {
		assert.match(run(["-h"]).stdout, /Usage/i);
		const version = run(["-v"]);
		assert.equal(version.status, 0, version.output);
		assert.equal(version.stdout.trim(), pkg.version);
	});

	it("does not take a following option for the value of --project or --output", () => {
		const project = run(["--project", "--output", freshOut()]);
		assert.equal(project.status, 1);
		noStackTrace(project);
		assert.match(project.stderr, /--project/);

		const output = run(["--project", ws.project(), "--output"]);
		assert.equal(output.status, 1);
		noStackTrace(output);
		assert.match(output.stderr, /--output/);
	});

	it("fails when the project file does not exist", () => {
		const missing = path.join(ws.dir, "nope.ftpp");
		const result = run(["--project", missing, "--output", freshOut()]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /nope\.ftpp/);
	});

	it("fails when the project file is not valid JSON", () => {
		const file = path.join(ws.dir, "broken.ftpp");
		fs.writeFileSync(file, "{ this is not json");
		const result = run(["--project", file, "--output", freshOut()]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /Unsupported project format/);
	});

	it("fails when the project has no images list", () => {
		const file = path.join(ws.dir, "empty.ftpp");
		fs.writeFileSync(file, JSON.stringify({ packOptions: {} }));
		const result = run(["--project", file, "--output", freshOut()]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /images/);
	});

	it("fails when the project has no images at all", () => {
		const out = freshOut();
		const result = run(["--project", ws.project({ images: [], folders: [] }), "--output", out]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /No images/i);
		assert.deepEqual(listFiles(out), []);
	});

	it("fails on an unknown packer option", () => {
		const result = run(["--project", ws.project({}, { packer: "NoSuchPacker" }), "--output", freshOut()]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /Unknown packer/);
	});
});

describe("unavailable images", () => {
	it("an image that does not exist fails the run and writes nothing", () => {
		const out = freshOut();
		const missing = path.join(ws.dir, "images", "ghost.png");
		const project = ws.project({
			images: [
				{ name: "red.png", path: ws.image("red.png"), folder: "" },
				{ name: "ghost.png", path: missing, folder: "" },
			],
		});
		const result = run(["--project", project, "--output", out]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /ghost\.png/);
		assert.deepEqual(listFiles(out), []);
	});

	it("reports every missing image, not only the first", () => {
		const project = ws.project({
			images: [
				{ name: "a.png", path: path.join(ws.dir, "a-missing.png"), folder: "" },
				{ name: "b.png", path: path.join(ws.dir, "b-missing.png"), folder: "" },
			],
		});
		const result = run(["--project", project, "--output", freshOut()]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /a-missing\.png/);
		assert.match(result.stderr, /b-missing\.png/);
	});

	it("a file that is not a valid image fails the run and writes nothing", () => {
		const out = freshOut();
		const bad = path.join(ws.dir, "images", "corrupt.png");
		fs.writeFileSync(bad, Buffer.from("this is not a png"));
		const project = ws.project({
			images: [
				{ name: "red.png", path: ws.image("red.png"), folder: "" },
				{ name: "corrupt.png", path: bad, folder: "" },
			],
		});
		const result = run(["--project", project, "--output", out]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /corrupt\.png/);
		assert.deepEqual(listFiles(out), []);
		fs.rmSync(bad);
	});

	it("a project folder that does not exist fails the run", () => {
		const out = freshOut();
		const project = ws.project({ folders: [path.join(ws.dir, "no-such-folder")] });
		const result = run(["--project", project, "--output", out]);
		assert.equal(result.status, 1);
		noStackTrace(result);
		assert.match(result.stderr, /no-such-folder/);
		assert.deepEqual(listFiles(out), []);
	});
});
