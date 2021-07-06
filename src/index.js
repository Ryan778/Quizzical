/** 
 *  @fileOverview JavaScript for the backend. Most of this code is provided by Electron, with annotations and comments added in to help clarify code portions. 
 *
 *  @author       Electron Forge, Electron, Ryan Zhang
 *
 *  @license      MIT
 *  @requires     electron@11.1.1
 */

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const isMac = process.platform === 'darwin';
const path = require('path');
const fs = require('fs'); 
const isDev = !app.isPackaged || parseInt(process.env.ELECTRON_DEV) === 1; 

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true, 
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};

const createHelpWindow = () => {
  // Create the browser window.
  const helpWindow = new BrowserWindow({
    width: 320,
    height: 540,
    webPreferences: {
      contextIsolation: false
    }
  });

  // and load the index.html of the app.
  helpWindow.loadFile(path.join(__dirname, 'help', 'index.html'));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Handler for loading the questions stored under questions.csv
ipcMain.on('get-questions', (event) => {
  // Read the file
  fs.promises.readFile(path.join(__dirname, 'questions.txt'), {
    encoding: 'utf8'
  }).then((data) => {
    // Convert the CSV file into an array of questions
    let output = []; 
    // Split each line into an array item
    data = data.split('\r\n').forEach(i => {
      // Convert the question from plaintext into an object
      let item = i.split(';'); 
      // Push the object to our output array
      output.push({
        type: item[0], // (string) Which type of question (mc, tf, sa, o, n)
        question: item[1], // (string) Question text
        answer: (item[0] !== 'o') ? item[2] : item.slice(2), // (string|array) Correct answer
        explanation: (item[0] === 'tf') ? item[3] : null, // (null|string) Why a T/F question was false
        options: (item[0] === 'mc' || item[0] === 'o') ? item.slice(2) : null // (null|array) Options, if applicable (mc only)
      }); 
    }); 
    // Send the question list to the render window
    event.reply('set-questions', output); 
  })
}); 

/**
 * @name ipcMain.on('prompt-for-exit')
 * prompt-for-exit presents the user with a dialog confirming if they'd like to exit the application before doing so (if they select OK). 
 */
ipcMain.on('prompt-for-exit', (event) => {
  dialog.showMessageBox({
    type: 'question', 
    buttons: ['OK', 'Cancel'], 
    defaultId: 0, 
    title: 'Quizzical: Exit App?', 
    message: `Are you sure you would like to exit Quizzical?`
  }).then(r => {
    if (r.response === 0) {
      app.exit(); 
    }
  })
});

/**
 * @name ipcMain.on('prompt-for-quiz-exit')
 * prompt-for-quiz-exit presents the user with a dialog asking if they'd like to exit the quiz, and warns them that no in-progress quizzes are saved. 
 */
ipcMain.on('prompt-for-quiz-exit', (event) => {
  dialog.showMessageBox({
    type: 'warning', 
    buttons: ['OK', 'Cancel'], 
    defaultId: 1, 
    title: 'Quizzical: Exit Quiz?', 
    message: `Are you sure you would like to exit this quiz?\nYou will not be able to resume this quiz later.`
  }).then(r => {
    if (r.response === 0) {
      event.reply('quiz-exit'); 
    }
  }); 
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url); 
});

const template = [
  // { role: 'appMenu' }
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] : []),
  // { role: 'fileMenu' }
  {
    label: 'File',
    submenu: [
      isMac ? { role: 'close' } : { role: 'quit' }
    ]
  },
  // { role: 'editMenu' }
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking' },
            { role: 'stopSpeaking' }
          ]
        }
      ] : [
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ])
    ]
  },
  // { role: 'viewMenu' }
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      ...(isDev ? [
        { role: 'toggleDevTools' }
      ]: []), 
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  // { role: 'windowMenu' }
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ] : [
        { role: 'close' }
      ])
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Open Help Pages',
        click: async () => {
          createHelpWindow(); 
        }
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)