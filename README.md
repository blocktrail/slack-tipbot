Bitcoin TipBot For Slack
========================
Easily transfer money between team members on your Slack channel.

### Features
 - With a single message, send and receive Bitcoins
 - Every member has his own wallet
 - Every tip is a real Bitcoin transaction, recorded on the blockchain
 - Self hosted so you are always in control of your coins

### TipBot as a Service
If you want to have a TipBot for your Slack team without having to host the bot yourself,  
You can setup a hosted TipBot (by BlockTrail): https://tipbot.blocktrail.com


How to Run a TipBot
-------------------
### Setup
 - Grab a free API key from BlockTrail [here](https://www.blocktrail.com/signup)
 - Add a bot integration to Slack [here](https://my.slack.com/services/new/bot)
    - Make sure you copy the Slack API token

### Install
 - `git clone https://github.com/blocktrail/slack-tipbot`
 - `cd slack-tipbot`
 - `npm install`

### Run
Change the `YOUR_SLACK_TOKEN`, `YOUR_API_KEY`, `YOUR_API_SECRET`, `YOUR_VERY_VERY_SECRET_SECRET` in the below snippet 
to the API key and secret, slack token and some random secret.
```sh
DEBUG="tipbot:*" node bot.js \
  --slack-token="YOUR_SLACK_TOKEN" \
  --blocktrail-apikey="YOUR_API_KEY" \
  --blocktrail-apisecret="YOUR_API_SECRET" \
  --secret="YOUR_VERY_VERY_SECRET_SECRET"
```

You can also use ENV vars instead of arguments:
 - `TIPBOT_SLACK_TOKEN`, `TIPBOT_BLOCKTRAIL_APIKEY`, `TIPBOT_BLOCKTRAIL_APISECRET`, `TIPBOT_SECRET`

You should use something like [forever](https://www.npmjs.com/package/forever) or [supervisord](http://supervisord.org/) to keep it running on a server,
but using a `screen` does the job too xD

You can add `--testnet` (or ENV var `TIPBOT_TESTNET="true"`) to make the bot run on testnet instead of mainnet (for development for example).

#### YOUR_VERY_VERY_SECRET_SECRET
The value for `YOUR_VERY_VERY_SECRET_SECRET` is used to create passwords for the wallets of the users of the tipbot. 
If someone gets a hold of your API key and secret, then YOUR_VERY_VERY_SECRET_SECRET will serve as an extra security measure, to prevent the coins from being stolen.

### Usage
You can control / communicate with the tipbot by sending the bot a **direct message** or **mentioning** it's name in a channel.  
The tipbot responds to certain 'trigger words' in a sentence, so you can wrap the trigger word in a nice looking sentence and it will work.

For example, to trigger the `help` command you can could say `hey @tipbot can you help me figure out how tipping works` 
and the `help` in that sentence will trigger displaying the help information.

#### Commands / Trigger words
##### `help` - *ask the bot for help*
eg; `hey @tipbot can you show me the help info!`

##### `balance` - *ask the bot for your current balance*
eg; `hey @tipbot can you please tell me my balance`

##### `send <value + unit> @someone` - *tell the bot to send coins to someone*  
eg; `@tipbot please send 0.1 BTC to @bob` will send 0.1 BTC to @bob.  

the `<value + unit>` can be `0.1 BTC` or `10000000 Satoshi`  

this command has a few aliases which you can use; `give` and `sent`  
eg; `@tipbot can you give @bob 0.1 BTC` or `@tipbot I'd like you to send @bob 0.1 BTC`

##### `receive <value + unit> @someone` - *tell the bot to request coins from someone*
eg; `@tipbot I want to receive 0.1 BTC from @bob` will request 0.1 BTC from @bob.  

after you've requested coins from someone that person will be asked if that is OK, replying with `yes`, `ok` or `sure` will make the transaction happen.  

the `<value + unit>` can be `0.1 BTC` or `10000000 Satoshi`  

this command has a few aliases which you can use; `ask`, `demand`, `deserve`, `send me`, `give me`, `gimme` and `owes me`  
eg; `@tipbot I demand 0.1 BTC from @bob for making such a cool bot` or `@tipbot @bob please gimme 0.1 BTC for lunch`

##### `deposit` - *ask the bot for a deposit address* 
eg; `@tipbot I'd like to deposit some BTC`

##### `withdraw` -  *tell the bot you want to withdraw to an address*  
eg; `@tipbot I want to withdraw 0.5 BTC to 1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp`  

after you've requested the withdraw the bot will confirm with you if it's OK, reploying with `yes`, `ok` or `sure` will make the transaction happen.

#### Channels
By default the tipbot joins the default `#general` channel, you can invite him into other channels just like you invite normal users into channels.


Security / Privacy
------------------
The tipbot is in full control of the coins (BlockTrail can't access the coins).

When you invite the tipbot into a channel it can see all the messages in the channel, 
keep this in mind if the tipbot is hosted by that one intern that has left your company for a competitor ;-)


Features ToDo
-------------
 - withdraw EVERYTHING 
 - transaction history
 - better way of dealing with errors
 - add option for users to set a custom password (would require them to give the password or a browser extension to sign transactions)
 - think of a way to deal with deleted users with BTC balance
 - respond to being the receiver of the action
 - use the `Trigger` class for all triggers, not just temporary ones
