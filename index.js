
const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const LABEL_NAME = 'testing';

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function listMessagesWithNoReplies(auth) {
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread -in:sent -in:chat',
    });

    if (res.data.resultSizeEstimate !== 0) {
      const messages = res.data.messages;
      if (messages.length === 0) {
        console.log('No emails found.');
      } else {
        for (const message of messages) {
          await handleEmail(auth, message.threadId);
        }
      }
    }
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  }
}

async function handleEmail(auth, threadId) {
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
    });

    if (thread.data.messages.length === 1) {
      const emailSubject = thread.data.messages[0].payload.headers.find(
        (header) => header.name === 'Subject'
      ).value;
      const senderEmail = thread.data.messages[0].payload.headers.find(
        (header) => header.name === 'From'
      ).value;

      console.log('Subject: ', emailSubject);
      console.log('Sender Email: ', senderEmail);

      // TODO: Check senderEmail in the DB and handle accordingly

      const replyMessage = 'Your automatic reply message here.';
      await sendReply(auth, threadId, emailSubject, replyMessage, senderEmail);
    }
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  }
}

async function sendReply(auth, threadId, subject, message, senderEmail) {
  const gmail = google.gmail({ version: 'v1', auth });
  const emailContent = `Subject: Re: ${subject}\nTo: ${senderEmail}\n\n${message}`;
  const base64EncodedEmail = Buffer.from(emailContent).toString('base64');

  try {
    const label = await gmail.users.labels.create({
      userId: 'me',
      resource: {
        name: LABEL_NAME,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    
    if (label) {
      await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        resource: {
          addLabelIds: [label.data.id],
        },
      });

      await gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: base64EncodedEmail,
          threadId: threadId,
        },
      });

      console.log('Reply sent.');
     
    }
  } catch (err) {
    if (err.code !== 409) {
      console.log('Error creating label or sending message: ' + err);
    }
  }
}

 // this function call authorize function & list message
async function runTask() {
  try {
    const auth = await authorize();
    await listMessagesWithNoReplies(auth);
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  }
}

// function for Run the task in random intervals (45 to 120 seconds)
function runTaskWithRandomInterval() {
  const interval = Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000; // in milliseconds
  console.log(`Next run in ${interval / 1000} seconds.`);
  setTimeout(() => {
    runTask();
    runTaskWithRandomInterval();
  }, interval);
}

runTaskWithRandomInterval();