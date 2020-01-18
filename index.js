#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const argv = require('optimist').argv;
const chalk = require('chalk');
const texturePacker = require('free-tex-packer-core');

const appInfo = require('./package.json');

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
        if(isFolder(p) && p.toUpperCase().indexOf('__MACOSX') < 0) {
            list = getFolderFilesList(p, base + file + '/', list);
        }
        else {
            list.push({
                name: (base ? base : '') + file,
                path: p
            });
        }
    }

    return list;
}

function loadImages(images, files) {
    for(let image of images) {
        try {
            files.push({path: image.name, contents: fs.readFileSync(image.path)});
        }
        catch(e) {
        }
    }
}

console.log(chalk.yellowBright("Free Texture Packer CLI v" + appInfo.version));

let projectPath = argv.project;
if(!projectPath) {
    console.log(chalk.redBright('Choose project, using --project argument'));
    process.exit();
}

fs.readFile(projectPath, (err, content) => {
    if(err) {
        console.error(err.toString());
        return;
    }

    content = content.toString();
    let project = null;
    try {
        project = JSON.parse(content);
    }
    catch(e) {
        console.log(chalk.redBright('Unsupported project format ' + projectPath));
        process.exit();
    }

    let outputPath = argv.output;

    if(!outputPath) {
        outputPath = project.savePath;
    }

    if(!outputPath) {
        outputPath = path.dirname(projectPath);
    }

    let files = [];

    loadImages(project.images, files);

    for(let folder of project.folders) {
        if(isExists(folder)) {
            let list = getFolderFilesList(folder, getNameFromPath(folder) + '/');
            loadImages(list, files);
        }
    }

    let options = project.packOptions;

    //Map exporters to core format
    if(options.exporter === 'JSON (hash)') options.exporter = 'JsonHash';
    if(options.exporter === 'JSON (array)') options.exporter = 'JsonArray';
    if(options.exporter === 'XML') options.exporter = 'XML';
    if(options.exporter === 'css (modern)') options.exporter = 'Css';
    if(options.exporter === 'css (old)') options.exporter = 'OldCss';
    if(options.exporter === 'pixi.js') options.exporter = 'Pixi';
    if(options.exporter === 'Phaser (hash)') options.exporter = 'PhaserHash';
    if(options.exporter === 'Phaser (array)') options.exporter = 'PhaserArray';
    if(options.exporter === 'Phaser 3') options.exporter = 'Phaser3';
    if(options.exporter === 'Spine') options.exporter = 'Spine';
    if(options.exporter === 'cocos2d') options.exporter = 'Cocos2d';
    if(options.exporter === 'UnrealEngine') options.exporter = 'Unreal';
    if(options.exporter === 'Starling') options.exporter = 'Starling';
    if(options.exporter === 'Unity3D') options.exporter = 'Unity3D';
    if(options.exporter === 'Godot (atlas)') options.exporter = 'GodotAtlas';
    if(options.exporter === 'Godot (tileset)') options.exporter = 'GodotTileset';

    if(options.exporter === 'custom') {
        console.log(chalk.redBright('CLI does not support a custom exporter'));
        process.exit();
    }
    
    options.appInfo = appInfo;
    
    console.log(chalk.white('Start packing ') + chalk.magentaBright(projectPath));

    texturePacker(files, options, (files) => {
        for(let file of files) {
            let out = path.resolve(outputPath, file.name);
            console.log(chalk.white('Writing ') + chalk.greenBright(out));
            fs.writeFileSync(out, file.buffer);
        }

        console.log(chalk.yellowBright("Done"));
    });
});

