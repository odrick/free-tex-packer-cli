const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { makeWorkspace, run, WEBP } = require("./helpers");

let ws;
let webpFolder;

before(() => {
	ws = makeWorkspace();
	webpFolder = path.join(ws.dir, "webp");
	fs.mkdirSync(webpFolder);
	fs.writeFileSync(path.join(webpFolder, "orange.webp"), WEBP.orange);
	fs.writeFileSync(path.join(webpFolder, "blue.WEBP"), WEBP.blue);
	fs.writeFileSync(path.join(webpFolder, "Thumbs.db"), "not an image");
});
after(() => ws.cleanup());

let counter = 0;
function freshOut() {
	const dir = path.join(ws.dir, "webp-out-" + ++counter);
	fs.mkdirSync(dir);
	return dir;
}

const frames = (out) => Object.keys(JSON.parse(fs.readFileSync(path.join(out, "atlas.json"), "utf8")).frames).sort();

describe("webp input", () => {
	it("packs .webp images listed in the project together with png images", () => {
		const out = freshOut();
		const project = ws.project({
			images: [
				{ name: "red.png", path: ws.image("red.png"), folder: "" },
				{ name: "orange.webp", path: path.join(webpFolder, "orange.webp"), folder: "" },
			],
		});
		const result = run(["--project", project, "--output", out]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(frames(out), ["orange.webp", "red.png"]);
	});

	it("picks up .webp files (any letter case) when scanning a project folder, and ignores other files", () => {
		const out = freshOut();
		const result = run(["--project", ws.project({ images: [], folders: [webpFolder] }), "--output", out]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(frames(out), ["webp/blue.WEBP", "webp/orange.webp"]);
	});

	it("writes a .webp texture when textureFormat is webp", () => {
		const out = freshOut();
		const result = run(["--project", ws.project({}, { textureFormat: "webp" }), "--output", out]);
		assert.equal(result.status, 0, result.output);
		assert.deepEqual(fs.readdirSync(out).sort(), ["atlas.json", "atlas.webp"]);
		const head = fs.readFileSync(path.join(out, "atlas.webp"));
		assert.equal(head.subarray(0, 4).toString(), "RIFF");
		assert.equal(head.subarray(8, 12).toString(), "WEBP");
	});

	it("fails (and writes nothing) for a .webp file that cannot be decoded", () => {
		const out = freshOut();
		const broken = path.join(webpFolder, "broken.webp");
		fs.writeFileSync(broken, Buffer.concat([Buffer.from("RIFF\x10\x00\x00\x00WEBP", "latin1"), Buffer.from("garbage bytes")]));
		const project = ws.project({ images: [{ name: "broken.webp", path: broken, folder: "" }] });
		const result = run(["--project", project, "--output", out]);
		fs.rmSync(broken);
		assert.equal(result.status, 1, result.output);
		assert.match(result.stderr, /broken\.webp/);
		assert.deepEqual(fs.readdirSync(out), []);
	});
});
