const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = require("../package.json");

/** Lowest version mentioned in a node range such as ">=20.9.0", "^18.20.0||>=22" or ">= 14.0". */
function lowestNode(range) {
	const versions = [...String(range).matchAll(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/g)].map((m) => [
		Number(m[1]),
		Number(m[2] || 0),
		Number(m[3] || 0),
	]);
	assert.ok(versions.length, `cannot read a version from engines range "${range}"`);
	return versions.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])[0];
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

describe("package.json", () => {
	it("depends on free-tex-packer-core 0.4 or newer", () => {
		// ^0.3.x does not accept 0.4.0 (caret ranges of 0.x versions stop at the next minor)
		assert.match(pkg.dependencies["free-tex-packer-core"], /^\^0\.(?:[4-9]|\d{2,})\./);
	});

	it("declares a Node.js version that every dependency supports", () => {
		assert.ok(pkg.engines && pkg.engines.node, 'missing "engines.node"');
		const own = lowestNode(pkg.engines.node);
		for (const name of Object.keys(pkg.dependencies)) {
			const dep = JSON.parse(fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8"));
			if (!dep.engines || !dep.engines.node) continue;
			assert.ok(
				compare(own, lowestNode(dep.engines.node)) >= 0,
				`engines.node (${pkg.engines.node}) allows Node older than ${name}@${dep.version} requires (${dep.engines.node})`
			);
		}
	});

	it("links to the right GitHub repository", () => {
		const expected = "https://github.com/odrick/free-tex-packer-cli";
		assert.equal(pkg.url, expected, '"url" is written into the exported files, keep it https');
		assert.equal(pkg.homepage, expected + "#readme");
		assert.equal(pkg.bugs && pkg.bugs.url, expected + "/issues");
		assert.match(pkg.repository.url, /github\.com\/odrick\/free-tex-packer-cli/);
	});

	it("publishes the executable and nothing unneeded", () => {
		const bin = pkg.bin["free-tex-packer-cli"];
		assert.ok(fs.existsSync(path.join(root, bin)), `bin file ${bin} does not exist`);
		assert.match(fs.readFileSync(path.join(root, bin), "utf8"), /^#!\/usr\/bin\/env node/);
		assert.ok(Array.isArray(pkg.files), 'missing "files" list');
		assert.ok(pkg.files.includes(path.basename(bin)), `"files" must include ${bin}`);
		assert.ok(!pkg.files.some((f) => /test/i.test(f)), "tests must not be published");
	});
});
