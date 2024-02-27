const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const app = express();
app.use(bodyParser.json());
app.use(cors()); // Enable CORS
// Путь к файлу базы данных
const dbPath = 'db.db';

let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});

db.run('CREATE TABLE IF NOT EXISTS user(id INTEGER PRIMARY KEY, name TEXT, password TEXT, number TEXT, email TEXT, role TEXT)', [], (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Table created');
});

db.run('CREATE TABLE IF NOT EXISTS card(id INTEGER PRIMARY KEY, userId INTEGER, urlImg TEXT, name TEXT, description TEXT, obl TEXT, region TEXT, descriptionusl TEXT, ratings REAL)', [], (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Table card created');
});

db.run('CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, cardId INTEGER, description TEXT, date TEXT, rating INTEGER)', [], (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Table comments created');
});

app.post('/register', async (req, res) => {
  const { name, password, number, email, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  // Проверка, что такой email не зарегистрирован
  db.get('SELECT * FROM user WHERE email = ?', [email], (err, row) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }

    if (row) {
      res.status(400).json({"error":"Email already registered"});
      return;
    }

    db.run('INSERT INTO user(name, password, number, email, role) VALUES(?,?,?,?,?)', [name, hashedPassword, number, email, role], function(err) {
      if (err) {
        res.status(400).json({"error":err.message});
        return;
      }
      res.json({
          "message":"success",
          "data":{ name, number, email, role },
          "id":this.lastID
      });
    });
  });
});

app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM user WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }

    if (row) {
      res.json({
        "message":"success",
        "data":{
          "id": row.id,
          "name": row.name,
          "number": row.number,
          "email": row.email,
          "role": row.role 
        }
      });
    } else {
      res.status(404).json({"error":"User not found"});
    }
  });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM user WHERE email = ?', [email], async (err, row) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }

    if (row && row.password) {
      const isValidPassword = await bcrypt.compare(password, row.password);

      if (isValidPassword) {
        res.json({
          "message":"success",
          "data":{ name: row.name, number: row.number, email: row.email, role: row.role, id:row.id },
          "id":row.id
        });
      } else {
        res.status(401).json({"error":"Invalid password"});
      }

    } else {
      res.status(404).json({"error":"User not found"});
    }
  });
});

app.post('/cards', (req, res) => {
  const card = req.body;
  db.run('INSERT INTO card(userId, urlImg, name, description, obl, region, descriptionusl, ratings) VALUES(?,?,?,?,?,?,?,?)', [card.userId, card.urlImg, card.name, card.description, card.obl, card.region, card.descriptionusl, 0], function(err) {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }
    res.json({
        "message":"success",
        "data":card,
        "id":this.lastID
    });
  });
});
app.get('/cards', (req, res) => {
  db.all('SELECT card.*, comments.id as commentId, comments.description as commentDescription, comments.date as commentDate, comments.rating as commentRating FROM card LEFT JOIN comments ON card.id = comments.cardId', [], (err, rows) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }

    const result = {};
    rows.forEach(row => {
      if (!result[row.id]) {
        result[row.id] = {
          id: row.id,
          userId: row.userId,
          urlImg: row.urlImg,
          name: row.name,
          description: row.description,
          obl: row.obl,
          region: row.region,
          descriptionusl: row.descriptionusl,
          ratings: row.ratings,
          comments: []
        };
      }
      if (row.commentId) {
        result[row.id].comments.push({
          id: row.commentId,
          description: row.commentDescription,
          date: row.commentDate,
          rating: row.commentRating
        });
      }
    });

    res.json({
      "message":"success",
      "data":Object.values(result)
    });
  });
});

app.post('/cards/:cardId/comments', (req, res) => {
  const { cardId } = req.params;
  const { description, rating } = req.body;
  const date = new Date().toISOString();
  db.run('INSERT INTO comments(cardId, description, date, rating) VALUES(?,?,?,?)', [cardId, description, date, rating], function(err) {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }
    db.run('UPDATE card SET ratings = (SELECT AVG(rating) FROM comments WHERE cardId = ?) WHERE id = ?', [cardId, cardId], function(err) {
      if (err) {
        res.status(400).json({"error":err.message});
        return;
      }
      res.json({
          "message":"success",
          "data":{ description, date, rating },
          "id":this.lastID
      });
    });
  });
});

app.get('/cards/:cardId/comments', (req, res) => {
  const { cardId } = req.params;
  db.all('SELECT * FROM comments WHERE cardId = ?', [cardId], (err, rows) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }
    res.json({
        "message":"success",
        "data":rows
    });
  });
});

app.delete('/cards/:cardId', async (req, res) => {
  const { cardId } = req.params;
  const { userId } = req.body;

  db.get('SELECT role FROM user WHERE id = ?', [userId], async (err, row) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }

    if (1==1) {
      db.run('DELETE FROM card WHERE id = ?', [cardId], function(err) {
        if (err) {
          res.status(400).json({"error":err.message});
          return;
        }
        res.json({
          "message":"success",
          "data":{ cardId }
        });
      });
    } else {
      res.status(403).json({"error":"Ты не админ или это не твоя карта"});
    }
  });
});
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});