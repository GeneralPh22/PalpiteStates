const express = require("express");

const app = express();

// mostrar arquivos da pasta public
app.use(express.static("public"));

app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando");
});
