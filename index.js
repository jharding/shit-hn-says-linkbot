// dependencies
// ------------

var f = require('util').format
  , fs = require('fs')
  , path = require('path')
  , Log = require('log')
  , Twitter = require('ntwitter')
  , hnsearch = require('hnsearch')
  , config = require('./config');

// configuration
// -------------

var twitter = new Twitter({
      consumer_key: config.consumerKey
    , consumer_secret: config.consumerSecret
    , access_token_key: config.accessTokenKey
    , access_token_secret: config.accessTokenSecret
    })
  , tweetFormat = [
      'Best guess:'
    , 'http://news.ycombinator.com/item?id=%s'
    , '/cc @%s'
    ].join(' ')
  , log = new Log(
      'info'
    , fs.createWriteStream( path.join(__dirname, 'log.log'), { flags: 'a' })
    );

// shs_linkbot
// -----------

log.info('launching @shs_linkbot');

getRepliedToTweetIds(function(err, repliedToTweetIds) {
  if (err) { return log.error('failed to get replied to tweets'); }

  getNewTweets(repliedToTweetIds, function(err, newTweets) {
    if (err) { return log.error('failed to get new tweets'); }

    newTweets.forEach(function(tweet) {
      var query = {
            'weights[text]': 1
          , 'weights[title]': 0
          , 'weights[url]': 0
          , 'weights[domain]': 0
          , 'weights[username]': 0
          , 'weights[type]': 0
          , q: tweet.text
            .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, ' ')
            .replace(/\s{2,}/g, ' ') // strip regex charactesr
          }
        , comment;

      hnsearch.comments(query, function(err, res) {
        if (err) { return log.error('failed to search hnsearch'); }

        if (comment = getTopComment(res.results)) {
          log.info(
            'found comment %s with score %s for tweet %s'
          , comment.item.id
          , comment.score
          , tweet.id_str
          );

          replyToTweetWithCommentInfo(tweet, comment.item);
        }

        else {
          log.notice('failed to find comment for %s', tweet.id_str);
        }
      });
    });
  });
});

// functions!
// ----------

function getRepliedToTweetIds(cb) {
  var params = { screen_name: 'shs_linkbot', count: 100 }
    , repliedToTweetIds = [];

  twitter.getUserTimeline(params, function(err, tweets) {
    if (err) { return cb(err); }

    tweets.forEach(function(tweet) {
      repliedToTweetIds.push(tweet.in_reply_to_status_id_str);
    });

    cb(null, repliedToTweetIds);
  });
}

function getNewTweets(oldTweets, cb) {
  var params = {
        count: 10
      , include_rts: false
      , screen_name: 'shit_hn_says'
      }
    , newTweets;

  twitter.getUserTimeline(params, function(err, tweets) {
    if (err) { return cb(err); }

    newTweets = tweets.filter(function(tweet) {
      return !~oldTweets.indexOf(tweet.id_str);
    });

    cb(null, newTweets);
  });
}

function replyToTweetWithCommentInfo(inReplyToTweet, hnComment) {
  var text = f(tweetFormat, hnComment.id, inReplyToTweet.user.screen_name)
    , params = { in_reply_to_status_id: inReplyToTweet.id_str };

  twitter.updateStatus(text, params, function(err, tweet) {
    if (err) {
      return log.error('failed to reply to %s', inReplyToTweet.id_str);
    }

    log.info('tweeted %s in reply to %s', tweet.id_str, inReplyToTweet.id_str);
  });
}

function getTopComment(results) {
  var ids
    , resultsWithoutChildren;

  ids = results.map(function(result) {
    return result.item.id;
  });

  resultsWithoutChildren = results.filter(function(result) {
    return !~ids.indexOf(result.item.parent_id);
  });

  return resultsWithoutChildren[0];
}
