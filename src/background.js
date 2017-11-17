import path from 'path';
import url from 'url';
import jetpack from 'fs-jetpack';
import { app, BrowserWindow, ipcMain } from 'electron';
import createWindow from './helpers/window';

// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from './env';

// Save userData in separate folders for each environment.
// Thanks to this you can use production and development versions of the app
// on same machine like those are two separate apps.
if (env.name !== 'production') {
  const userDataPath = app.getPath('userData');
  app.setPath('userData', `${userDataPath} (${env.name})`);
}

var data;

function reset(){
  data = {
    nodes: [],
    links: [],
    clusters: [],
    distance_matrix: []
  };
};

reset();

const manifest = jetpack.cwd(app.getAppPath()).read('package.json', 'json');

ipcMain.on('log', (event, msg) => console.log(msg));

app.on('ready', () => {
  const mainWindow = createWindow('main', {
    width: 1024,
    height: 768,
    show: true
  });
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true,
  }));
  if(env.name === 'development'){
    mainWindow.openDevTools();
  }
  ipcMain.on('tick',    (event, val) => mainWindow.send('tick',    val));
  ipcMain.on('message', (event, msg) => mainWindow.send('message', msg));
});

ipcMain.on('parse-file', (event, instructions) => {
  var worker = 'workers/'
  if(instructions.file.slice(-3) === 'csv'){
    worker += 'parse-link-csv.html';
  } else {
    worker += 'parse-fasta.html';
  }
  const parserWindow = createWindow('File Parser', {show: false});
  parserWindow.loadURL(url.format({
    pathname: path.join(__dirname, worker),
    protocol: 'file:',
    slashes: true
  }));
  parserWindow.on('ready-to-show', e => {
    parserWindow.send('deliver-instructions', instructions);
  });
});

ipcMain.on('compute-mst', (event, titles) => {
  const computeWindow = createWindow('MST Computer', {show: false});
  computeWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/compute-mst.html'),
    protocol: 'file:',
    slashes: true
  }));
  computeWindow.on('ready-to-show', e => {
    computeWindow.send('deliver-data', data);
  });
});

function distribute(type, sdata, except){
  BrowserWindow.getAllWindows().forEach(openWindow => {
    if(openWindow.id !== except){
      openWindow.send(type, sdata);
    }
  });
}

ipcMain.on('update-data', (e, newData) => {
  Object.assign(data, newData);
  distribute('deliver-data', data, e.sender.id);
});

ipcMain.on('update-node-selection', (event, newNodes) => {
  data.nodes.forEach(d => d.selected = newNodes.find(nn => nn.id == d.id).selected);
  distribute('update-node-selection', data.nodes, event.sender.id);
});

ipcMain.on('update-node-cluster', (event, newNodes) => {
  data.nodes.forEach(d => d.cluster = newNodes.find(nn => nn.id == d.id).cluster);
  distribute('update-node-cluster', data.nodes, event.sender.id);
});

ipcMain.on('update-link-visibility', (event, newLinks) => {
  data.links.forEach((l, i) => l.visible = newLinks[i].visible);
  distribute('update-link-visibility', data.links, event.sender.id);
});

ipcMain.on('update-clusters', (event, clusters) => {
  data.clusters = clusters;
  distribute('update-clusters', data.clusters);
});

ipcMain.on('update-links-mst', (event, newLinks) => {
  data.links = newLinks;
  distribute('update-links-mst', data.links);
});

ipcMain.on('get-data',     e => e.sender.send('deliver-data',     data));
ipcMain.on('get-manifest', e => e.sender.send('deliver-manifest', manifest));
ipcMain.on('get-component', (e, component) => {
  e.returnValue = jetpack.cwd(app.getAppPath()).read('app/components/'+component, 'utf8');
  e.sender.send('deliver-component', e.returnValue);
});

ipcMain.on('launch-view', (event, view) => {
  const thingWindow = createWindow(view, {
    width: 800,
    height: 600,
    show: true
  });
  thingWindow.loadURL(url.format({
    pathname: path.join(__dirname, view),
    protocol: 'file:',
    slashes: true
  }));
  if (env.name === 'development') {
    thingWindow.openDevTools();
  }
});

ipcMain.on('reset', reset);

app.on('window-all-closed', app.quit);
