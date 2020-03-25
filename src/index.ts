import express, {Request, Response, NextFunction, Express} from "express";

const app: Express = express();
const port = 5000;

app.get("/", (req: Request, res: Response<{ running: boolean }>, next: NextFunction) => {
    res.json({running: true});
});

app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`);
});
