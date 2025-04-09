<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration</title>
    <link rel="stylesheet" href="css/app.css">
    <style>
form{
    border: 2px solid blue;
    height: 250px;
    width: 300px;
    
}
h3{
    color: white;
}
body{
    background: rgb(62, 62, 71);
    padding-top: 150px;
}
.input{
    border: 1px solid blue;
    height: 30px;
    width: 270px;
    text-align: center;
    font-size: 19px; 

}
.sub{
    height: 40px;
    width: 200px;
    background:  rgb(76, 76, 228);
    font-size: 19px;
    color: white;
}

        </style>
</head>
<body>
    <center>
<form action="">
    @csrf
    <h3><u>Login here</u></h3>
    <input type="email" name="email" placeholder="Enter your email " class="input"><br><br>
    <input type="password" name="password" placeholder="password" class="input"><br><br>
    <input type="submit" class="sub" value="login">
</form>
<center>
</body>
</html>