
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration</title>
    <link rel="stylesheet" href="{{asset('css/')}}">
    
    <style>
form{
    border: 2px solid blue;
    height: 300px;
    width: 300px;
    
}
*{
    padding: 0px;
}
h3{
    color: white;
}
body{
    background: rgb(62, 62, 71)
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
    <h3><u>Contacts</u></h3>

    <input type="text" name="fullname" placeholder="Enter your names" class="input"><br><br>
    <input type="email" name="email" placeholder="Enter your email " class="input"><br><br>
    <input type="number" name="phone" placeholder="Enter your phone number" class="input"><br><br>
    <input type="submit" class="sub">
</form>
<center>
</body>
</html>