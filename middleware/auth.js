const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(403).json({ message: "Acceso denegado" });

    // Usa la misma lógica de "fallback" que en el login para la clave secreta
    const secret = process.env.JWT_SECRET || 'Secret_WAS_Key_123';

    jwt.verify(token, secret, (err, user) => {
        if (err) return res.status(401).json({ message: "Token inválido" });
        req.user = user;
        next();
    });
};