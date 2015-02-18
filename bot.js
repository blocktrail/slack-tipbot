var _ = require('lodash');
var debug = require('debug');
var Slack = require('slack-client');
var TipBot = require('./lib/tipbot');
var assert = require('assert');
var parseArgs = require('minimist');

var argv = parseArgs(process.argv.slice(2));

var SLACK_TOKEN = argv['slack-token'] || process.env.TIPBOT_SLACK_TOKEN,
    BLOCKTRAIL_APIKEY = argv['blocktrail-apikey'] || process.env.TIPBOT_BLOCKTRAIL_APIKEY,
    BLOCKTRAIL_APISECRET = argv['blocktrail-apisecret'] || process.env.TIPBOT_BLOCKTRAIL_APISECRET,
    SECRET = argv['secret'] || process.env.TIPBOT_SECRET,
    TESTNET = true,
    AUTO_RECONNECT = true,
    OPTIONS = {ALL_BALANCES: true, DEMAND: true};

assert(SLACK_TOKEN, "--slack-token or TIPBOT_SLACK_TOKEN is required");
assert(BLOCKTRAIL_APIKEY, "--blocktrail-apikey or TIPBOT_BLOCKTRAIL_APIKEY is required");
assert(BLOCKTRAIL_APISECRET, "--blocktrail-apisecret or TIPBOT_BLOCKTRAIL_APISECRET is required");
assert(SECRET, "--secret or TIPBOT_SECRET is required");

/**
 * find a DM channel object by userID
 *
 * @param userId
 * @returns {*}
 */
Slack.prototype.getDMByUserId = function(userId) {
    return _.find(this.dms, {user: userId});
};

var slack = new Slack(SLACK_TOKEN, AUTO_RECONNECT, /* AUTO_MARK */ true);
var tipbot = new TipBot(slack, BLOCKTRAIL_APIKEY, BLOCKTRAIL_APISECRET, SECRET, TESTNET, OPTIONS);

slack.on('open', function() {
    var channels = [],
        groups = [];

    _.each(slack.channels, function(channel, key) {
        if (channel.is_member) {
            channels.push('#' + channel.name);
        }
    });

    _.each(slack.groups, function(group, key) {
        if (group.is_open && !group.is_archived) {
            groups.push(group.name);
        }
    });

    debug('tipbot:bot')('Connected to Slack. You are @%s of %s', slack.self.name, slack.team.name);
    debug('tipbot:bot')('You are in (channels): %s', channels.join(', '));
    debug('tipbot:bot')('As well as (groups): %s', groups.join(', '));

    // init the tipbot
    tipbot.init();
});

slack.on('message', function(message) {
    // debug messages to seperate channel so we only log them when explicitly enabled
    debug('tipbot:messages')('MESSAGE', message.type, message.channel, message.user, message.text);

    var type = message.type,
        channel = slack.getChannelGroupOrDMByID(message.channel),
        member = slack.getUserByID(message.user);

    // Respond to messages with the reverse of the text received.
    if (type === 'message') {
        // random stuff we can safely ignore
        if (!message.text || !member) {
            return;
        }

        // let tipbot handle the message
        tipbot.onMessage(channel, member, message.text);
    }
});

slack.on('userChange', function(u) {
    tipbot.onUserChange(u);
});

slack.on('error', function(error) {
    debug('Error: %s', error);
});

slack.login();
