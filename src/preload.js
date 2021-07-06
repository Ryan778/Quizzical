/** 
 *  @fileOverview preload.js significantly improves application security by ensuring only trusted, whitelisted methods from the main (higher privilege) process can be called from the renderer process. In Quizzical, only the "send message" tool (ipcRenderer) is exposed, and only whitelisted channels can be used. 
 *
 *  @author       Ryan Zhang
 *
 *  @license      MIT
 *  @requires     electron@11.1.1
 */

const {
  contextBridge,
  ipcRenderer
} = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'ipcRenderer', {
    send: (channel, data) => {
      // whitelist channels
      let validChannels = ['get-questions', 'prompt-for-exit', 'prompt-for-quiz-exit', 'open-external'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      let validChannels = ['set-questions', 'quiz-exit'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
);