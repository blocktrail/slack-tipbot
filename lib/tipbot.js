var _ = require('lodash');
var debug = require('debug')('tipbot:tipbot');
var async = require('async');
var request = require('request');
var blocktrail = require('blocktrail-sdk');
var User = require('./user');
var Trigger = require('./trigger');
var bitcoin = require('bitcoinjs-lib');

// MIN_TIP equal to BASE_FEE
var MIN_TIP = blocktrail.toSatoshi(0.0001);

var TipBot = function(slack, BLOCKTRAIL_APIKEY, BLOCKTRAIL_APISECRET, SECRET, TESTNET, OPTIONS) {
    var self = this;

    self.initializing = false;

    self.slack = slack;
    self.client = blocktrail({
        apiKey: BLOCKTRAIL_APIKEY,
        apiSecret: BLOCKTRAIL_APISECRET,
        network: "BTC",
        testnet: TESTNET
    });
    self.explorerBaseUrl = "https://www.blocktrail.com/" + (TESTNET ? "tBTC" : "BTC");

    self.TESTNET = TESTNET;
    self.SECRET = SECRET;

    self.OPTIONS = _.defaults(OPTIONS, {
        ALL_BALANCES: false,
        DEMAND: false
    });

    self.users = {};
    self.triggers = [];
};

TipBot.prototype.addUser = function(user, updateRegex) {
    var self = this;

    if (typeof updateRegex === "undefined") {
        updateRegex = true;
    }

    self.users[user.id] = user;
    if (updateRegex) {
        self.updateUserRegex();
    }
};

TipBot.prototype.updateUserFromMember = function(member, updateRegex) {
    var self = this;

    if (typeof updateRegex === "undefined") {
        updateRegex = true;
    }

    if (self.users[member.id] && member.deleted) {
        delete self.users[member.id];
    }

    if (member.deleted || member.is_bot) {
        return;
    }

    if (self.users[member.id]) {
        self.users[member.id].updateFromMember(member);
        if (updateRegex) {
            self.updateUserRegex();
        }
    } else {
        self.addUser(User.fromMember(self, member), updateRegex);
    }
}

/**
 * create a regex that matches any of the user IDs
 */
TipBot.prototype.updateUserRegex = function() {
    var self = this;

    var ids = _.reject(_.map(self.users, 'id'), function(id) {
        return id == self.slack.self.id;
    });
    var names = _.reject(_.map(self.users, 'name'), function(id) {
        return id == self.slack.self.name;
    });

    self.userRegex = new RegExp("(" + _.union(ids, names).join('|') + ")", "g");
};

TipBot.prototype.init = function() {
    var self = this;

    if (self.initializing) {
        debug(".init called but still initializing...");
        return;
    }

    self.initializing = true;

    // get list of known users
    var url = 'https://slack.com/api/users.list?token=' + self.slack.token;
    request.get(url, function(err, response, body) {
        if (err) {
            debug('ERROR', err);
        }

        var data = JSON.parse(body);

        // add each user to our list of users
        _.each(data.members, function(member) {
            self.updateUserFromMember(member, false);
        });
        self.updateUserRegex();

        debug('TipBot ready!');
        debug('I am <@%s:%s> of %s', self.slack.self.id, self.slack.self.name, self.slack.team.name);
        debug('We have the following [' + Object.keys(self.users).length + '] known users; ', _.map(self.users, function(user) {
            return user.name;
        }).join(', '));

        // init wallet for each user so we don't have to later
        var newWalletCnt = 0;
        async.forEachLimit(Object.keys(self.users), 3, function(userId, cb) {
            var user = self.users[userId];

            // call getWallet to init the wallet (will create if not exists)
            user.getWallet(function(wallet, newWallet) {
                if (newWallet) {
                    newWalletCnt += 1;
                }

                cb();
            })
        }, function() {
            debug('We pregenerated [%d] new wallets', newWalletCnt);

            self.initializing = false;
        });
    });
};

TipBot.prototype.normalizeValue = function(value, unit) {
    if (unit.match(/satoshis?/i)) {
        value = parseInt(value);
    } else if (unit.match(/BTC/i)) {
        value = blocktrail.toSatoshi(value);
    } else {
        value = null; // @TODO: should give a proper error
    }

    return value;
};

TipBot.prototype.tellHelp = function(channel) {
    channel.send(
        "*TIPBOT COMMANDS* \n" +
        " - *balance*\t\task the bot for your current balance; _@tipbot what is my balance_ \n" +
        " - *send*\t\t\t\ttell the bot to send coins to someone; _@tipbot send 0.1 BTC to @someone_ \n" +
        "\t\t\t\t\t\t\t_aliases: give_ \n" +
        " - *receive*\t\ttell the bot to request coins from to someone; _@tipbot receive 0.1 BTC from @someone_ \n" +
        "\t\t\t\t\t\t\t_aliases: demand, ask, deserve, get, give me, owes me_ \n" +
        " - *deposit*\t\task the bot for a deposit address; _@tipbot let me deposit!_ \n" +
        " - *withdraw*\ttell the bot to withdraw to a address; _@tipbot withdraw 1 BTC to 1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp!_ \n"
    );
};

TipBot.prototype.onUserChange = function(member) {
    var self = this;

    self.updateUserFromMember(member);
};

TipBot.prototype.onMessage = function(channel, member, message) {
    var self = this;

    var amount, value;

    var user = self.users[member.id];

    if (!user) {
        return;
    }

    if (user.id == self.slack.self.id) {
        return;
    }

    // debug message
    debug(channel.name, member.name, message, channel.is_channel);

    // check if we should parse this
    if (channel.is_channel && !message.match(self.slack.self.id)) {
        debug('MESSAGE NOT FOR ME!');
        return;
    }

    // find user ID matches, ignore the sending user
    var userMatches = _.reject(message.match(self.userRegex), function(match) {
        return match == user.id || match == user.name;
    });

    // find real user objects
    userMatches = _.uniq(_.filter(_.map(userMatches, function(match) {
        // if it's an ID
        if (self.users[match]) {
            return self.users[match];
        }

        // find user by name
        var user = _.find(self.users, function(user) {
            return user.name == match;
        });

        if (!user) {
            debug("Failed to find user match [" + match + "]");
        }

        return user;
    })));

    /*
     * ALL BALANCES
     */
    if (message.match(/(all|every(one)?s?) ?balance/i)) {
        if (!self.OPTIONS.ALL_BALANCES) {
            channel.send("Retrieving all balances is disabled!");

            return;
        }

        async.map(Object.keys(self.users), function(userID, cb) {
            var user = self.users[userID];

            user.getBalanceLine(cb);
        }, function(err, result) {
            if (err) {
                debug("ERROR", err);
                return;
            }

            channel.send(result.join("\n"));
        });

        return;
    }

    /*
     * BALANCE
     */
    if (message.match(/balance/i)) {
        if (channel.is_channel) {
            channel.send("I don't think you really want me to tell your balance public channel, " + user.handle + " :/");
        }

        user.tellBalance(self.slack.getDMByUserId(user.id));

        return;
    }

    /*
     * DEPOSIT
     */
    if (message.match(/deposit/i)) {
        user.tellDepositeAddress(self.slack.getDMByUserId(user.id));

        return;
    }

    /*
     * WITHDRAW
     */
    if (message.match(/withdraw/i)) {
        amount = message.match(/(\d+\.?\d*) *(Satoshis?|BTC)/i);
        var address = message.match(/[132Nm][a-zA-Z0-9]{25,36}/g);

        if (address) {
            address = _.uniq(_.filter(address, function(address) {
                try {
                    return bitcoin.Address.fromBase58Check(address);
                } catch (e) {
                    return false;
                }
            }));

            if (!address.length) {
                channel.send("Sorry " + user.handle + " that's not a valid address!");

                return;
            } else if (address.length > 1) {
                channel.send("Sorry " + user.handle + " I can't do a withdraw to more than 1 address [" + address.join(", ") + "]");

                return;
            } else if (address.length == 1) {
                address = address[0];
                var addr = bitcoin.Address.fromBase58Check(address);

                if (self.TESTNET && addr.version != bitcoin.networks.testnet.pubKeyHash && addr.version != bitcoin.networks.testnet.scriptHash) {
                    channel.send("Sorry " + user.handle + " that's not a testnet address!");

                    return;
                } else if (!self.TESTNET && addr.version != bitcoin.networks.bitcoin.pubKeyHash && addr.version != bitcoin.networks.bitcoin.scriptHash) {
                    channel.send("Sorry " + user.handle + " that's not a bitcoin address!");

                    return;
                }
            }
        } else {
            channel.send("Sorry " + user.handle + " I need to know an address to withdraw to");

            return;
        }

        if (amount) {
            value = self.normalizeValue(amount[1], amount[2]);
        } else {
            channel.send("Sorry " + user.handle + " I need to how much you want to withdraw");

            return;
        }

        var dm = self.slack.getDMByUserId(user.id);

        dm.send("You want to withdraw " + blocktrail.toBTC(value) + " BTC to " + address + ".");
        dm.send("Are you OK with that?");

        self.triggers.push(new Trigger(
            self,
            function(channel, message, _user, userMatches) {
                var trigger = this;

                if (channel.id == dm.id && _user.id == user.id && message.match(/(OK|yes|fine|sure)/i)) {
                    user.withdraw(self.slack.getDMByUserId(user.id), value, address);
                    trigger.destroy();

                    return true;
                } else if (channel.id == dm.id && _user.id == user.id && message.match(/(no)/i)) {
                    trigger.destroy();

                    return true;
                }

                return false;
            },
            {
                timeout: 600000 // 10min
            }
        ));

        return;
    }

    /*
     * MENTIONS ANOTHER USER
     */
    if (userMatches.length == 1) {
        var mentioned = userMatches[0];

        amount = message.match(/(\d+\.?\d*) *(Satoshis?|BTC)/i);

        /*
         * DEMAND
         */
        var matches = message.match(/(ask|demand|deserve|receive|send ?me|give ?me|gimme|ow[en]?s? me)/i);
        if (amount && matches) {
            debug('REQUEST [' + matches[1] +  ']');
            if (!self.OPTIONS.DEMAND) {
                channel.send("Requesting coins is disabled!");

                return;
            }

            value = self.normalizeValue(amount[1], amount[2]);

            if (value < MIN_TIP) {
                channel.send(user.handle + ": the minimum tip amount is " + blocktrail.toBTC(MIN_TIP) + " BTC");

                return;
            }

            channel.send(mentioned.handle + ": " + user.handle + " is requesting " + blocktrail.toBTC(value) + " BTC from you ...");
            channel.send("Are you OK with that?");

            self.triggers.push(new Trigger(
                self,
                function(channel, message, user, userMatches) {
                    var trigger = this;

                    if (user.id == mentioned.id && message.match(/(OK|yes|fine|sure)/i)) {
                        mentioned.send(channel, user, value);
                        trigger.destroy();

                        return true;
                    } else if (user.id == mentioned.id && message.match(/(no)/i)) {
                        trigger.destroy();

                        return true;
                    }

                    return false;
                },
                {
                    timeout: 600000 // 10min
                }
            ));

            return;
        }

        /*
         * SEND
         */
        if (amount && message.match(/(send|give|sent)/i)) {
            value = self.normalizeValue(amount[1], amount[2]);

            if (value < MIN_TIP) {
                channel.send(user.handle + ": the minimum tip amount is " + blocktrail.toBTC(MIN_TIP) + " BTC");

                return;
            }

            channel.send("OK! I'll send " + mentioned.handle + " " + blocktrail.toBTC(value) + " BTC");

            user.send(channel, mentioned, value);

            return;
        }
    }

    /*
     * TMP TRIGGERS
     */
    var triggers = self.triggers.slice();
    if (_.any(triggers, function(trigger) {
            return trigger.match(channel, message, user, userMatches);
        })) {

        return;
    }

    /*
     * MENTIONS MULTIPLE USER
     */
    if (userMatches.length > 1) {
        channel.send("Sorry " + user.handle + " but you're mentioning too many people!");

        return;
    }

    /*
     * HELP
     */
    debug('help?', message.match(/help/i));
    if (message.match(/help/i)) {
        console.log(channel);
        self.tellHelp(channel);

        return;
    }

    /*
     * OOPS
     */
    channel.send("Sorry " + user.handle + " but I did not understand that :(");

    return;
};

module.exports = TipBot;
