var _ = require('lodash');
var debug = require('debug')('tipbot:user');
var async = require('async');
var blocktrail = require('blocktrail-sdk');
var pbkdf2 = require('pbkdf2-compat').pbkdf2Sync;

var User = function(tipbot, userId, userName) {
    var self = this;

    self.tipbot = tipbot;
    self.id = userId;
    self.name = userName;
    self.handle = self.getSlackHandle();
};

User.prototype.updateFromMember = function(member) {
    var self = this;

    self.name = member.name;
    self.handle = self.getSlackHandle();
};

User.prototype.getWallet = function(cb, retry) {
    var self = this;

    if (typeof retry === "undefined") {
        retry = false;
    }

    if (!self.wallet) {
        var walletIdentifier = "SLACK-" + self.id,
            walletPassphrase = pbkdf2("SLACK-" + self.id, self.tipbot.SECRET, 2048, 64, 'sha512').toString('hex');

        self.tipbot.client.initWallet(walletIdentifier, walletPassphrase, function(err, wallet) {
            if (err && err.statusCode == 404) {
                self.tipbot.client.createNewWallet(walletIdentifier, walletPassphrase, function(err, wallet) {
                    self.wallet = wallet;

                    cb(self.wallet, true);
                });
            } else if (err) {
                debug('ERROR', err);

                if (!retry) {
                    setTimeout(function() {
                        self.getWallet(cb, true);
                    }, 3000);
                } else {
                    cb();
                }
            } else {
                self.wallet = wallet;

                cb(self.wallet);
            }
        });
    } else {
        cb(self.wallet);
    }
};

User.prototype.tellBalance = function(channel) {
    var self = this;

    self.getBalanceLine(function(err, line) {
        channel.send(line);
    });
};

User.prototype.getBalanceLine = function(cb) {
    var self = this;

    self.getWallet(function(wallet) {
        wallet.getBalance(function(err, confirmed, unconfirmed) {
            if (err) {
                return debug('ERROR', err);
            }

            cb(null, self.handle + " confirmed; " + blocktrail.toBTC(confirmed) + " BTC | unconfirmed; " + blocktrail.toBTC(unconfirmed) + " BTC");
        });
    });
};

User.prototype.tellDepositeAddress = function(channel) {
    var self = this;

    self.getWallet(function(wallet) {
        wallet.getNewAddress(function(err, address) {
            if (err) {
                return debug('ERROR', err);
            }

            channel.send(self.handle + " you can deposite to; " + address);
        });
    });
};

User.prototype.withdraw = function(channel, value, address) {
    var self = this;

    self.getWallet(function(wallet) {
        wallet.getBalance(function(err, confirmed, unconfirmed) {
            if (err) {
                console.log(err);
                channel.send(err.message);
            } else if (confirmed >= value) {
                // EVERYTHING
                if (value == confirmed) {
                    value -= blocktrail.toSatoshi(0.0002); // some random fee because we don't have a swipe function yet
                }

                var pay = {};
                pay[address] = value;
                wallet.pay(pay, function(err, txHash) {
                    if (err) {
                        console.log(err);
                        channel.send(err.message);
                        return;
                    }

                    var url = self.tipbot.explorerBaseUrl + "/tx/" + txHash;
                    channel.send("Withdrawl of " + blocktrail.toBTC(value) + " BTC to " + address + " transaction; " + url);
                });
            } else if (confirmed + unconfirmed >= value) {
                channel.send("Sorry " + self.handle + " you have to wait for your previous transactions to be confirmed before you can do this ...");
            } else {
                channel.send("Sorry " + self.handle + " you do not have enough balance to do this ...");
            }
        });
    });
};

User.prototype.send = function(channel, user, value) {
    var self = this;

    // do self and user in parallel to speed things up a bit
    async.parallel({
        self: function(cb) {
            self.getWallet(function(wallet) {
                wallet.getBalance(function(err, confirmed, unconfirmed) {
                    if (err) {
                        cb(err);
                    } else if (confirmed == value) {
                        cb(new Error("Sorry " + self.handle + " you can't send your full balance, need to account for the fee ..."));
                    } else if (confirmed >= value) {
                        cb(null, true);
                    } else if (confirmed + unconfirmed >= value) {
                        cb(new Error("Sorry " + self.handle + " you have to wait for your previous transactions to be confirmed before you can do this ..."));
                    } else {
                        cb(new Error("Sorry " + self.handle + " you do not have enough balance to do this ..."));
                    }
                });
            });
        },
        user: function(cb) {
            user.getWallet(function(wallet) {
                wallet.getNewAddress(function(err, address) {
                    cb(err, address);
                });
            });
        }
    }, function(err, results) {
        if (err) {
            console.log(err);
            channel.send(err.message);
            return;
        }

        self.getWallet(function(wallet) {
            var send = {};
            send[results.user] = value;

            wallet.pay(send, function(err, txHash) {
                if (err) {
                    console.log(err);
                    channel.send(err.message);
                    return;
                }

                var url = self.tipbot.explorerBaseUrl + "/tx/" + txHash;
                channel.send("Sent " + blocktrail.toBTC(value) + " BTC from " + self.handle + " to " + user.handle + " transaction; " + url);
            });
        });
    })
};

User.prototype.getSlackHandle = function() {
    var self = this;

    return "<@" + self.id + "|" + self.name + ">";
};

User.fromMember = function(tipbot, member) {
    var user = new User(tipbot, member.id, member.name);

    return user;
};

module.exports = User;
