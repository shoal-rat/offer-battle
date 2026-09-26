// Transport only. Browser ownership and the role policy live in the isolated runner.
import net from 'node:net';
const socket=net.connect(process.argv[2]);socket.on('connect',()=>{process.stdin.pipe(socket);socket.pipe(process.stdout)});socket.on('error',()=>process.exit(1));socket.on('end',()=>process.exit(0));process.stdin.on('end',()=>socket.end());
