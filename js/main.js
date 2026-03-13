import { setupAuth } from './auth.js';
import { addItem, listenToInventory } from './inventory.js';
import { processSale } from './sales.js';

// Holds our stock data so we can update UI anywhere
let globalInventory =
