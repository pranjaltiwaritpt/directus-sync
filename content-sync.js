import fs from 'fs';
import { 
  createDirectus, 
  rest, 
  authentication, 
  readItems, 
  readItem, 
  updateItem, 
  createItem 
} from '@directus/sdk';

// configuration
const PROD_URL = 'https://directus-sync.onrender.com/'; // Replace with your Render URL
const PROD_EMAIL = 'admin@example.com';
const PROD_PASSWORD = 'password';

const DEV_URL = 'http://localhost:8055';
const DEV_EMAIL = 'admin@example.com';
const DEV_PASSWORD = 'password';

const COLLECTION = 'Block_Grid'; // The exact name of the collection you want to sync
const STATE_FILE = './sync-state.json';

// initialize Directus clients for both environments
const prodClient = createDirectus(PROD_URL).with(rest()).with(authentication());
const devClient = createDirectus(DEV_URL).with(rest()).with(authentication());

async function runSync() {
  try {
    // Authenticate both clients
    console.log('Authenticating with Prod and Dev environments...');
    await prodClient.login({ email: PROD_EMAIL, password: PROD_PASSWORD });
    await devClient.login({ email: DEV_EMAIL, password: DEV_PASSWORD });

    // read timestamp of last sync from state file
    let lastSyncDate = '1970-01-01T00:00:00Z'; // Default to the beginning of time
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (state[COLLECTION]) lastSyncDate = state[COLLECTION];
    }

    console.log(`Checking for items updated after: ${lastSyncDate}`);

    // fetch items from the production environment that have been updated or created since the last sync
    // We check for items where date_updated OR date_created is newer than our last sync
    const changedItems = await prodClient.request(
      readItems(COLLECTION, {
        filter: {
          _or: [
            { date_updated: { _gt: lastSyncDate } },
            { date_created: { _gt: lastSyncDate } }
          ]
        },
        limit: -1, // Fetch all matching items
      })
    );

    if (changedItems.length === 0) {
      console.log(`No new or updated items found in ${COLLECTION}.`);
      return;
    }

    console.log(`Found ${changedItems.length} item(s) to sync. Applying to local database...`);

    // prod to dev sync logic
    for (const item of changedItems) {
      try {
        // Check if the item already exists locally by trying to fetch it
        await devClient.request(readItem(COLLECTION, item.id));
        
        // If it succeeds, the item exists. We update it.
        await devClient.request(updateItem(COLLECTION, item.id, item));
        console.log(`[UPDATED] Item ID: ${item.id}`);
      } catch (error) {
        // If the fetch fails, the item does not exist locally. We create it.
        await devClient.request(createItem(COLLECTION, item));
        console.log(`[CREATED] Item ID: ${item.id}`);
      }
    }

    // save new sync timestamp to state file
    const newSyncDate = new Date().toISOString();
    const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {};
    state[COLLECTION] = newSyncDate;
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`\nSync complete! New timestamp saved: ${newSyncDate}`);

  } catch (error) {
    console.error('\nSync failed with error:');
    console.error(error.errors ? error.errors : error.message);
  }
}

runSync();