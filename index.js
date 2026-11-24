#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const argv = require('optimist').argv;
const chalk = require('chalk');
const texturePacker = require('free-tex-packer-core');

const appInfo = require('./package.json');

// Images found while scanning a project folder (images listed in the project are loaded whatever their extension).
const FOLDER_IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

// Project file exporter names -> exporter names of free-tex-packer-core.
const EXPORTERS = {
    'JSON (hash)': 'JsonHash',
    'JSON (array)': 'JsonArray',
    'XML': 'XML',
    'css (modern)': 'Css',
    'css (old)': 'OldCss',
    'pixi.js': 'Pixi',
    'Phaser (hash)': 'PhaserHash',
    'Phaser (array)': 'PhaserArray',
    'Phaser 3': 'Phaser3',
    'Spine': 'Spine',
    'cocos2d': 'Cocos2d',
    'UnrealEngine': 'Unreal',
    'Starling': 'Starling',
    'Unity3D': 'Unity3D',
    'Godot (atlas)': 'GodotAtlas',
    'Godot (tileset)': 'GodotTileset'
};

const USAGE = [
    'Usage: free-tex-packer-cli --project <file.ftpp> [--output <folder>]',
    '',
    'Options:',
    '  --project  path to a Free texture packer project file (.ftpp)',
    '  --output   folder for the result; by default the "savePath" of the project,',
    '             or the folder of the project file',
    '  --help     show this help',
    '  --version  show the version',
    '',
    'Exit code: 0 on success, 1 if anything went wrong (nothing is written then).'
].join('\n');

function isExists(path) {
    return fs.existsSync(path);
}

function fixPath(path) {
    return path.trim().split('\\').join('/');
}

function getNameFromPath(path) {
    return path.trim().split('/').pop();
}

function isFolder(path) {
    if(isExists(path)) {
        return fs.statSync(path).isDirectory();
    }
    else {
        path = fixPath(path);
        let name = getNameFromPath(path);
        let parts = name.split('.');
        return parts.length === 1;
    }
}

function getFolderFilesList(dir, base = '', list = []) {
    let files = fs.readdirSync(dir);
    for(let file of files) {
        let p = path.resolve(dir, file);
        if(isFolder(p)) {
            if(p.toUpperCase().indexOf('__MACOSX') < 0) {
                list = getFolderFilesList(p, base + file + '/', list);
            }
        }
        else if(FOLDER_IMAGE_EXT.test(file)) {
            list.push({
                name: (base ? base : '') + file,
                path: p
            });
        }
    }

    return list;
}

function describeError(e) {
    return (e && (e.message || e.description)) || String(e);
}

/** Prints the problem(s) to stderr and makes the process exit with code 1 (without cutting the output short). */
function fail(message, details = []) {
    console.error(chalk.redBright(message));
    for(let line of details) {
        console.error('  ' + line);
    }
    process.exitCode = 1;
}

function loadImages(images, files, problems) {
    for(let image of images) {
        if(!image || typeof image.path !== 'string' || typeof image.name !== 'string') {
            problems.push('Invalid image entry in the project: ' + JSON.stringify(image));
            continue;
        }

        try {
            files.push({path: image.name, contents: fs.readFileSync(image.path)});
        }
        catch(e) {
            problems.push('Cannot read image ' + image.path + ' (' + describeError(e) + ')');
        }
    }
}

function main() {
    if(argv.help || argv.h) {
        console.log(USAGE);
        return;
    }

    if(argv.version || argv.v) {
        console.log(appInfo.version);
        return;
    }

    console.log(chalk.yellowBright('Free Texture Packer CLI v' + appInfo.version));

    let projectPath = argv.project;
    if(typeof projectPath !== 'string' || !projectPath) {
        fail('Choose project, using --project argument', ['Run with --help for usage.']);
        return;
    }

    let content;
    try {
        content = fs.readFileSync(projectPath, 'utf8');
    }
    catch(e) {
        fail('Cannot read project ' + projectPath + ' (' + describeError(e) + ')');
        return;
    }

    let project;
    try {
        project = JSON.parse(content);
    }
    catch(e) {
        fail('Unsupported project format ' + projectPath);
        return;
    }

    if(!project || !Array.isArray(project.images) || (project.folders !== undefined && !Array.isArray(project.folders))
        || !project.packOptions || typeof project.packOptions !== 'object') {
        fail('Invalid project ' + projectPath, ['The "images" list and the "packOptions" object are required.']);
        return;
    }

    let outputPath = argv.output;
    if(outputPath !== undefined && (typeof outputPath !== 'string' || !outputPath)) {
        fail('Choose the output folder, using --output argument');
        return;
    }

    if(!outputPath) {
        outputPath = project.savePath;
    }

    if(!outputPath) {
        outputPath = path.dirname(projectPath);
    }

    let options = project.packOptions;

    if(options.exporter === 'custom') {
        fail('CLI does not support a custom exporter');
        return;
    }

    //Map exporters to core format
    if(EXPORTERS[options.exporter]) options.exporter = EXPORTERS[options.exporter];

    let files = [];
    let problems = [];

    loadImages(project.images, files, problems);

    for(let folder of (project.folders || [])) {
        if(typeof folder !== 'string' || !isExists(folder) || !isFolder(folder)) {
            problems.push('Folder not found: ' + folder);
            continue;
        }

        let list = getFolderFilesList(folder, getNameFromPath(fixPath(folder)) + '/');
        loadImages(list, files, problems);
    }

    if(problems.length) {
        fail('Cannot start packing, ' + problems.length + (problems.length === 1 ? ' problem' : ' problems') + ' found:', problems);
        return;
    }

    if(!files.length) {
        fail('No images found in the project ' + projectPath);
        return;
    }

    options.appInfo = appInfo;

    console.log(chalk.white('Start packing ') + chalk.magentaBright(projectPath));

    // free-tex-packer-core skips images it cannot decode and only reports that with console.error.
    // Catch these reports, an atlas without some of its sprites must not be written silently.
    let skipped = [];
    let originalConsoleError = console.error;
    console.error = (...args) => {
        let match = /^free-tex-packer-core: Error reading (.+)$/.exec(args.join(' '));
        if(match) skipped.push(match[1]);
        else originalConsoleError.apply(console, args);
    };

    let finish = (result, error) => {
        console.error = originalConsoleError;

        if(error) {
            fail('Packing failed: ' + describeError(error));
            return;
        }

        if(skipped.length) {
            fail('Cannot start packing, ' + skipped.length + (skipped.length === 1 ? ' image is' : ' images are') + ' not a valid image:',
                skipped.map(name => 'Cannot decode image ' + name));
            return;
        }

        try {
            fs.mkdirSync(outputPath, {recursive: true});

            for(let file of result) {
                let out = path.resolve(outputPath, file.name);
                console.log(chalk.white('Writing ') + chalk.greenBright(out));
                fs.writeFileSync(out, file.buffer);
            }
        }
        catch(e) {
            fail('Cannot write the result: ' + describeError(e));
            return;
        }

        console.log(chalk.yellowBright('Done'));
    };

    try {
        texturePacker(files, options, finish);
    }
    catch(e) {
        finish(undefined, e);
    }
}

main();
