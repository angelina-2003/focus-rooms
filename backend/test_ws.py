import asyncio
import websockets

async def test():
    uri = "ws://127.0.0.1:8000/ws/ce35f1d0-001a-457e-ad39-bd7a14438cdd/e93c2936-0c0c-4d5c-8340-7ad43a7317ae"
    async with websockets.connect(uri, additional_headers={"Origin": "http://localhost"}) as ws:
        msg = await ws.recv()
        print("Received:", msg)

asyncio.run(test())