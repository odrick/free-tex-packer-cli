const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const cp = require("child_process");

const CLI = path.join(__dirname, "..", "index.js");

// ---- tiny PNG encoder (no dependencies) -------------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buf) {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const out = Buffer.alloc(body.length + 8);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE(crc32(body), body.length + 4);
	return out;
}

/** RGBA PNG; pixel(x, y) returns [r, g, b, a]. */
function makePng(width, height, pixel) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0; // filter: none
		for (let x = 0; x < width; x++) {
			const [r, g, b, a] = pixel(x, y);
			raw.set([r, g, b, a], y * (width * 4 + 1) + 1 + x * 4);
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/** A solid sprite surrounded by a transparent margin, so that trimming has something to do. */
function sprite(width, height, margin, color) {
	return makePng(width, height, (x, y) =>
		x >= margin && y >= margin && x < width - margin && y < height - margin ? [...color, 255] : [0, 0, 0, 0]
	);
}

// ---- workspace, project files, CLI runner -------------------------------------------------------

const PROJECT_EXPORTERS = {
	"JSON (hash)": "json",
	"JSON (array)": "json",
	XML: "xml",
	"css (modern)": "css",
	"css (old)": "css",
	"pixi.js": "json",
	"Godot (atlas)": "tpsheet",
	"Godot (tileset)": "tpset",
	"Phaser (hash)": "json",
	"Phaser (array)": "json",
	"Phaser 3": "json",
	Spine: "atlas",
	cocos2d: "plist",
	UnrealEngine: "paper2dsprites",
	Starling: "xml",
	UIKit: "plist",
	Unity3D: "tpsheet",
	Egret2D: "json",
};

const DEFAULT_PACK_OPTIONS = {
	textureName: "atlas",
	textureFormat: "png",
	removeFileExtension: false,
	prependFolderName: true,
	base64Export: false,
	tinify: false,
	tinifyKey: "",
	scale: 1,
	filter: "none",
	exporter: "JSON (hash)",
	fileName: "pack-result",
	savePath: "",
	width: 2048,
	height: 2048,
	fixedSize: false,
	powerOfTwo: false,
	padding: 0,
	extrude: 0,
	allowRotation: true,
	allowTrim: true,
	trimMode: "trim",
	alphaThreshold: 0,
	detectIdentical: true,
	packer: "MaxRectsBin",
	packerMethod: "BestShortSideFit",
};

/** Creates a temp directory with three sprites and (optionally) a folder with two more. */
function makeWorkspace() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ftp-cli-test-"));
	const images = path.join(dir, "images");
	fs.mkdirSync(images);
	const files = {
		"red.png": sprite(24, 16, 2, [230, 40, 40]),
		"green.png": sprite(12, 30, 3, [40, 200, 60]),
		"blue.png": sprite(20, 20, 0, [40, 60, 230]),
	};
	for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(images, name), data);

	const folder = path.join(dir, "ui");
	fs.mkdirSync(folder);
	fs.writeFileSync(path.join(folder, "button.png"), sprite(16, 10, 1, [250, 220, 0]));
	fs.writeFileSync(path.join(folder, "icon.png"), sprite(8, 8, 0, [10, 10, 10]));

	return {
		dir,
		out: path.join(dir, "out"),
		image: (name) => path.join(images, name),
		folder,
		project: (extra = {}, packOptions = {}) => {
			const project = {
				meta: { version: "0.6.7" },
				savePath: "",
				images: Object.keys(files).map((name) => ({ name, path: path.join(images, name), folder: "" })),
				folders: [],
				packOptions: { ...DEFAULT_PACK_OPTIONS, ...packOptions },
				...extra,
			};
			const file = path.join(dir, "project.ftpp");
			fs.writeFileSync(file, JSON.stringify(project, null, 2));
			return file;
		},
		cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
	};
}

function run(args, options = {}) {
	const result = cp.spawnSync(process.execPath, [CLI, ...args], {
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
		...options,
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

module.exports = { makePng, sprite, makeWorkspace, run, PROJECT_EXPORTERS, DEFAULT_PACK_OPTIONS, CLI };
