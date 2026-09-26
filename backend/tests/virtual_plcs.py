"""Virtual PLCs for testing drivers: Modbus TCP :5020, Fatek TCP :5500, FINS UDP :9601, S7 :1102, OPC UA :4841, Host Link + Modbus RTU on pty."""
import asyncio
import ctypes
import os
import pty
import socket
import struct
import threading
import tty

WORDS = [0] * 2000
WORDS[100] = 1234
WORDS[10] = 0b1000
BITS = [0] * 2000
BITS[5] = 1


def fatek_server(port=5500):
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", port))
    s.listen(5)
    while True:
        c, _ = s.accept()
        threading.Thread(target=fatek_client, args=(c,), daemon=True).start()


def fatek_reply(st, cmd, data):
    frame = b"\x02" + f"{st}{cmd}0{data}".encode()
    return frame + f"{sum(frame) & 0xFF:02X}".encode() + b"\x03"


def fatek_client(c):
    buf = b""
    while True:
        d = c.recv(1024)
        if not d:
            return
        buf += d
        while b"\x03" in buf:
            fr, buf = buf.split(b"\x03", 1)
            t = fr[fr.find(b"\x02") + 1:-2].decode()
            st, cmd, body = t[:2], t[2:4], t[4:]
            n = int(body[:2], 16)
            out = ""
            if cmd == "46":
                a = int(body[3:8])
                out = "".join(f"{WORDS[a + i]:04X}" for i in range(n))
            elif cmd == "47":
                a = int(body[3:8])
                for i in range(n):
                    WORDS[a + i] = int(body[8 + i * 4:12 + i * 4], 16)
                out = ""
            elif cmd == "44":
                a = int(body[3:7])
                out = "".join(str(BITS[a + i]) for i in range(n))
            elif cmd == "45":
                a = int(body[3:7])
                BITS[a] = int(body[7])
                out = ""
            c.sendall(fatek_reply(st, cmd, out))


def fins_udp(port=9601):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", port))
    while True:
        d, addr = s.recvfrom(2048)
        hdr, mrc, body = d[:10], d[10:12], d[12:]
        a, count = struct.unpack(">H", body[1:3])[0], struct.unpack(">H", body[4:6])[0]
        rh = bytes([0xC0, 0, 2, 0, hdr[7], 0, 0, hdr[4], 0, hdr[9]])
        if mrc == b"\x01\x01":
            data = b"".join(struct.pack(">H", WORDS[a + i]) for i in range(count))
        else:
            for i in range(count):
                WORDS[a + i] = struct.unpack(">H", body[6 + i * 2:8 + i * 2])[0]
            data = b""
        s.sendto(rh + mrc + b"\x00\x00" + data, addr)


def hl_fcs(t):
    x = 0
    for ch in t:
        x ^= ord(ch)
    return f"{x:02X}"


def hostlink_pty():
    m, sl = pty.openpty()
    tty.setraw(sl)
    open("/tmp/hostlink_pty", "w").write(os.ttyname(sl))
    buf = b""
    while True:
        buf += os.read(m, 1024)
        while b"*\r" in buf:
            fr, buf = buf.split(b"*\r", 1)
            t = fr.decode()
            unit, hdr, body = t[1:3], t[3:5], t[5:-2]
            a = int(body[:4])
            if hdr.startswith("R"):
                data = "".join(f"{WORDS[a + i]:04X}" for i in range(int(body[4:8])))
            else:
                for i in range((len(body) - 4) // 4):
                    WORDS[a + i] = int(body[4 + i * 4:8 + i * 4], 16)
                data = ""
            r = f"@{unit}{hdr}00{data}"
            os.write(m, (r + hl_fcs(r) + "*\r").encode())


def s7_server(port=1102):
    import snap7
    from snap7.type import SrvArea
    srv = snap7.server.Server()
    db1 = (ctypes.c_uint8 * 100)()
    db1[0], db1[1] = 0x04, 0xD2
    srv.register_area(SrvArea.DB, 1, db1)
    srv.start(tcp_port=port)
    return srv


async def opcua_server(port=4841):
    from asyncua import Server, ua
    srv = Server()
    await srv.init()
    srv.set_endpoint(f"opc.tcp://0.0.0.0:{port}")
    await srv.register_namespace("urn:dummy")
    ns = await srv.register_namespace("urn:siemens:plc")
    obj = srv.nodes.objects
    for nid, val, vt in (('"Motor1"."Start"', True, ua.VariantType.Boolean), ('"DB_Tank"."Level"', 42.5, ua.VariantType.Float),
                         ('"Counter"', 7, ua.VariantType.Int16)):
        v = await obj.add_variable(ua.NodeId(nid, ns), nid.replace('"', ""), ua.Variant(val, vt))
        await v.set_writable()
    async with srv:
        await asyncio.Event().wait()


async def modbus_servers():
    from pymodbus.datastore import ModbusDeviceContext, ModbusSequentialDataBlock, ModbusServerContext
    from pymodbus.server import StartAsyncTcpServer
    dev = ModbusDeviceContext(hr=ModbusSequentialDataBlock(1, [0] * 65530), co=ModbusSequentialDataBlock(1, [0] * 65530),
                                                         di=ModbusSequentialDataBlock(1, [0] * 65530), ir=ModbusSequentialDataBlock(1, [0] * 100))
    ctx = ModbusServerContext(devices=dev, single=True)
    await StartAsyncTcpServer(context=ctx, address=("127.0.0.1", 5020))


if __name__ == "__main__":
    for fn in (fatek_server, fins_udp, hostlink_pty):
        threading.Thread(target=fn, daemon=True).start()
    try:
        s7_server()
    except Exception as e:
        print("S7 server gagal:", e)

    async def main():
        await asyncio.gather(opcua_server(), modbus_servers())
    print("virtual PLCs running")
    asyncio.run(main())
