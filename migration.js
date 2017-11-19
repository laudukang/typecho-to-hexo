var toMarkdown = require('to-markdown');
var dao = require("mysql");
var moment = require('moment');
var config = require("./config");
var fs = require("fs");
var async = require("async");

//config.json
var client = dao.createConnection({
  host: config.host,
  user: config.user,
  port: config.port,
  password: config.password,
  database: config.database
});

//正文
var query_post = "SELECT cid, title, slug, created, modified, text, status, authorId FROM " +
  config.tablePrefix + "contents WHERE `type` != 'attachment'";
//文章分类及标签
var query_meta = "SELECT m.name, m.slug, m.type, m.description FROM " +
  config.tablePrefix + "relationships r INNER JOIN " +
  config.tablePrefix + "metas m ON r.mid = m.mid WHERE r.cid = ?";
//评论
var query_comment = "SELECT * FROM " + config.tablePrefix + "comments";

var duoshuo = {};
duoshuo.threads = [];
duoshuo.posts = [];

async.parallel([
  function(cb) {
    client.query(query_post, function(err, rows) {
      if (err) {
        throw err;
      }

      var rs = 0;
      rows.forEach(function(r) {
        var title = r.title;
        var slug = r.slug;
        var text = r.text;
        var tags = [];
        var category = null;
        var date = moment.unix(r.created).format("YYYY-MM-DD HH:mm:ss");
        var updated = moment.unix(r.modified).format("YYYY-MM-DD HH:mm:ss");

        var oldUrl = null;

        var thread = {
          "author_key": r.authorId,
          "thread_key": r.cid,
          "title": title
        }

        //文章分类及标签提取
        client.query(query_meta, [r.cid], function(err, metas) {
          if (!err) {
            metas.forEach(function(m) {
              if (m['type'] == 'tag') {
                tags.push(m['name']);
              } else {
                category = m['name'];
              }
            });
          }

          if (!fs.existsSync("./_post")) {
            fs.mkdirSync("./_post");
          }

          var filename = "./_post/" + slug + ".md";
          if (fs.existsSync(filename)) {
            fs.unlinkSync(filename);
          }

          //渲染post开始
          fs.appendFileSync(filename, "---\n");
          fs.appendFileSync(filename, "title: " + title + "\n");
          fs.appendFileSync(filename, "date: " + date + "\n");
          fs.appendFileSync(filename, "updated: " + date + "\n");
          if (category != null) {
            fs.appendFileSync(filename, "categories: " + category + "\n");
            oldUrl = getUrl(category, slug);
          }
          if (tags.length > 0) {
            if (tags.length > 1) {
              fs.appendFileSync(filename, "tags: [" + tags.toString() + "]\n");
            } else {
              fs.appendFileSync(filename, "tags: " + tags.toString() + "\n");
            }
          }
          fs.appendFileSync(filename, "keywords:\n"); //custom filed for seo
          fs.appendFileSync(filename, "description:\n"); //custom filed for seo
          fs.appendFileSync(filename, "typecho_id: " + r.cid + "\n");
          fs.appendFileSync(filename, "---\n\n");
          fs.appendFileSync(filename, toMarkdown(text));
          //渲染post结束

          rs++;

          if (oldUrl != null) {
            thread.url = oldUrl;
            duoshuo.threads.push(thread);
            if (rs == rows.length) {
              cb(null, 1);
            }
          }
        });
      });

    });
  },

  function(cb) {
    client.query(query_comment, function(err, comments) {
      if (err) {
        return;
      }

      comments.forEach(function(cm) {
        if (cm.coid == 2674) {
          console.log(cm);
        }
        var post = {
          "post_key": cm.coid,
          "thread_key": cm.cid,
          "message": cm.text,
          "parent_key": cm.parent,
          "author_name": cm.author,
          "author_email": cm.mail,
          "author_url": cm.url,
          "ip": cm.ip,
          "created_at": moment.unix(cm.created).format("YYYY-MM-DD HH:mm:ss")
        };

        duoshuo.posts.push(post);
      });

      cb(null, 2);
    });
  }
], function(err, results) {
  var file = "./duoshuo.json";
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }

  fs.appendFileSync(file, JSON.stringify(duoshuo));

  client.end();
});

function getUrl(category, slug) {
  return config.base + category + "/" + slug + ".html";
}
