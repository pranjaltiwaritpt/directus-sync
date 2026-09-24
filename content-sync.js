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

// directus configuration for both environments
const PROD_URL = 'https://directus-sync.onrender.com/'; 
const PROD_EMAIL = 'admin@example.com';
const PROD_PASSWORD = 'password';

const DEV_URL = 'http://localhost:8055';
const DEV_EMAIL = 'admin@example.com';
const DEV_PASSWORD = 'password';

// Use an array for multiple collections
const COLLECTIONS = ['Block_Grid', 'Test']; 
const STATE_FILE = './sync-state.json';

// initialize Directus clients for both environments
const prodClient = createDirectus(PROD_URL).with(rest()).with(authentication());
const devClient = createDirectus(DEV_URL).with(rest()).with(authentication());

async function runSync() {
  try {
    // Authenticate both clients (Using the object format to prevent OTP errors)
    console.log('Authenticating with Prod and Dev environments...');
    await prodClient.login({ email: PROD_EMAIL, password: PROD_PASSWORD });
    await devClient.login({ email: DEV_EMAIL, password: DEV_PASSWORD });

    // Load the state file once at the beginning
    const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {};
    const newSyncDate = new Date().toISOString();

    // loop collections and sync each one
    for (const collection of COLLECTIONS) {
      console.log(`\n--- Syncing Collection: ${collection} ---`);
      
      // Read timestamp for this specific collection
      let lastSyncDate = '1970-01-01T00:00:00Z'; 
      if (state[collection]) {
        lastSyncDate = state[collection];
      }

      console.log(`Checking for items updated after: ${lastSyncDate}`);

      // Fetch items from the production environment
      const changedItems = await prodClient.request(
        readItems(collection, {
          filter: {
            _or: [
              { date_updated: { _gt: lastSyncDate } },
              { date_created: { _gt: lastSyncDate } }
            ]
          },
          limit: -1, 
        })
      );

      if (changedItems.length === 0) {
        console.log(`No new or updated items found in ${collection}.`);
        state[collection] = newSyncDate; // Update state anyway
        continue; // Skip to the next collection
      }

      console.log(`Found ${changedItems.length} item(s) to sync. Applying to local database...`);

      // Prod to Dev sync logic
      for (const item of changedItems) {
        try {
          // Check if the item already exists locally
          await devClient.request(readItem(collection, item.id));
          
          // If it succeeds, update it
          await devClient.request(updateItem(collection, item.id, item));
          console.log(`[UPDATED] Item ID: ${item.id}`);
        } catch (error) {
          // If it fails, create it
          await devClient.request(createItem(collection, item));
          console.log(`[CREATED] Item ID: ${item.id}`);
        }
      }

      // Record the successful sync time for this specific collection
      state[collection] = newSyncDate;
    }

    // sync timestamps for all collections at once after the loop
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`\nAll collections synced successfully! New timestamps saved.`);

  } catch (error) {
    console.error('\nSync failed with error:');
    console.error(error.errors ? error.errors : error.message);
  }
}

runSync();