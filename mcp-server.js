/**
 * MoonWalk MCP Server
 * Exposes MoonWalk training data, troubleshooting database, parts catalog,
 * and installation calculators to LLM clients (like Gemini Advanced) using the Model Context Protocol (MCP).
 * 
 * Runs on Node.js using native HTTP module (no dependencies required).
 * Handles the standard SSE (Server-Sent Events) MCP transport.
 */

const http = require('http');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// 1. Data Store
const TROUBLE_DATA = [
    {
        code: '100094 / 100095',
        title: 'Lỗi Cơ Cấu Xoay Tay Van Bơm Sơn (Hard Valve to Turn)',
        type: 'pump',
        symptom: 'Kẹt van vòi phun, lỗi disengaging/opening vòi phun',
        cause: 'Tay gạt van bơm tinter bị cứng, không thể xoay mở hoặc đóng. Thường do sơn bị khô đóng cặn lâu ngày quanh cổ van, hoặc cơ cấu xoay bị lệch/hỏng cơ học.',
        steps: [
            'Nhìn trên phần mềm MoonWalk hoặc EVOservice để xác định chính xác vị trí chai tinter nào gây ra lỗi.',
            'Nhấn nút OFF-LINE hoặc tắt nguồn máy để đảm bảo an toàn.',
            'Mở cửa trước, rút chai sơn bị lỗi ra khỏi giá đỡ.',
            'Kiểm tra xem van có bị xoay ngược chiều kim đồng hồ trước đó do thợ sơn pha tay hay không. Thử xoay nhẹ tay van theo chiều kim đồng hồ để kiểm tra.',
            'Nếu van bị hỏng cơ học hoặc bị nghẹt sơn không thể xoay nhẹ nhàng, tiến hành thay thế bằng một bơm tinter dự phòng mới trong gói "Blue-bag" (0.5L, 1.0L hoặc 2.0L tương ứng).',
            'Vệ sinh khu vực gạt van trên carriage bằng khăn ẩm và lắp chai sơn mới trở lại máy.'
        ],
        warning: 'Tuyệt đối không dùng kìm hoặc các dụng cụ cơ khí bẻ mạnh van vì sẽ gây gãy trục van bên trong.'
    },
    {
        code: '101000 / 101009 / 101015 / 101016',
        title: 'Lỗi Định Vị Khung Di Động (Carriage Position Not Found)',
        type: 'carriage',
        symptom: 'Máy dừng đột ngột khi đang di chuyển ngang, báo lỗi vị trí trượt',
        cause: 'Đường ray trượt dẫn hướng (carriage rail) bên dưới bị rít, bám nhiều bụi bẩn, bụi sơn khô hoặc cặn dung môi từ additive/thinner gây cản trở chuyển động của bánh răng trượt.',
        steps: [
            'Bấm tắt nguồn máy MoonWalk bằng công tắc xanh lá.',
            'Sử dụng dung môi làm sạch (solvent/thinner vệ sinh) thấm vào khăn mềm, lau chùi kỹ đường ray dẫn hướng bên dưới suốt chiều dài của máy. Di chuyển cụm carriage bằng tay qua lại để lau sạch các khu vực bị che khuất.',
            'Sau khi làm sạch bụi bẩn và cặn bám, lấy một miếng khăn lau mềm khô khác, thấm dung dịch bôi trơn khô chuyên dụng chứa PTFE (dry PTFE lubricant, không chứa silicon).',
            'Lau đều dung dịch bôi trơn dọc theo đường ray dẫn hướng.',
            'Đóng kín cửa, đóng thanh roll-bar, bật nguồn máy và TouchMix lên để máy thực hiện chu trình reset căn chỉnh lại vị trí ban đầu.'
        ],
        warning: 'KHÔNG được xịt trực tiếp dung dịch bôi trơn hoặc dầu mỡ béo vào trong khoang máy. Việc dùng mỡ thông thường sẽ hút bụi sơn cực kỳ nhanh và làm lỗi kẹt ray nặng hơn.'
    },
    {
        code: '100109 / 100110',
        title: 'Gãy Cảm Biến Quang Học (Optic Fork Broken)',
        type: 'hardware',
        symptom: 'Đèn đỏ sáng liên tục, motor kẹt hoặc cảm biến quang bị gãy',
        cause: 'Người dùng cố tình tháo hoặc rút chai sơn ra khỏi giá đỡ khi cụm carriage đang di chuyển ngang hoặc đang gạt van bơm, khiến chai sơn đập vào cảm biến quang (Optic Fork) gây gãy/nứt.',
        steps: [
            'Tắt nguồn máy và RÚT CÁP NGUỒN ra khỏi ổ cắm để đảm bảo an toàn điện.',
            'Tháo tấm panel bảo vệ bên hông máy (thường tháo tấm bên trái sẽ thuận tiện nhất).',
            'Tháo cổng giá đỡ tại vị trí số 5 (dock position 5) để tạo khoảng trống thao tác.',
            'Dùng lục giác tháo 2 ốc giữ cụm cảm biến Optic Fork bị hỏng.',
            'Lắp cảm biến Optic Fork mới vào vị trí, đẩy cảm biến lên kịch trần vị trí trên cùng rồi siết chặt 2 ốc vít lục giác.',
            'Lắp ráp lại tấm giá đỡ số 5 và tấm panel hông máy. Cắm nguồn và khởi động lại để chạy kiểm tra.'
        ],
        warning: 'Luôn nhắc nhở người dùng: Chỉ được phép tháo lắp chai sơn khi máy ở trạng thái dừng hoàn toàn và đèn LED báo xanh lá hoặc khi máy ở chế độ OFF-LINE.'
    },
    {
        code: 'DE02375',
        title: 'Cân Sartorius Mất Kết Nối (Scale Communication Failure)',
        type: 'scale',
        symptom: 'Lỗi Weight parsing failed, không hiển thị trọng lượng cân trên phần mềm',
        cause: 'Cáp kết nối USB từ cân Sartorius đến bo mạch chính hoặc máy tính bị lỏng, đứt ngầm, hoặc do nhiễu điện từ xung quanh ảnh hưởng đến tín hiệu truyền nhận.',
        steps: [
            'Kiểm tra trực quan sợi cáp USB cắm sau cân Sartorius xem có bị lỏng không.',
            'Kiểm tra cáp kết nối đằng sau bộ điều khiển TouchMix.',
            'Khởi động lại phần mềm MoonWalk hoặc máy tính PC.',
            'Nếu cáp bị đứt ngầm, thay thế bằng cáp USB bọc giáp chống nhiễu chất lượng cao của hãng.'
        ],
        warning: 'Không thay thế bằng các sợi cáp sạc điện thoại thông thường không có lõi chống nhiễu vì sẽ gây chập chờn tín hiệu cân.'
    },
    {
        code: 'DE02050',
        title: 'Lỗi Sai Lệch Trọng Lượng Cân (Scale Weight Error)',
        type: 'scale',
        symptom: 'Cân nhảy số liên tục, kết quả cân không chính xác hoặc báo lỗi lệch tải',
        cause: 'Cân bị nghiêng (không thăng bằng), hoặc có luồng gió mạnh thổi trực tiếp từ điều hòa/quạt thông gió vào cân, hoặc đĩa cân chạm vào thành bảo vệ xung quanh.',
        steps: [
            'Kiểm tra giọt nước thăng bằng trên cân xem có nằm đúng hồng tâm tròn không. Nếu lệch, xoay chỉnh chân cân để thăng bằng lại.',
            'Đảm bảo đĩa cân tròn không chạm vào bất kỳ phần cứng hay rác sơn nào bên dưới.',
            'Đóng rèm cuốn của máy MoonWalk để cách ly luồng gió từ quạt bên ngoài xưởng.',
            'Hiệu chuẩn (calibrate) lại cân Sartorius bằng quả cân chuẩn 2kg theo tài liệu hướng dẫn.'
        ],
        warning: 'Luôn tắt máy lạnh xịt trực tiếp vào khoang máy và vệ sinh đĩa cân sạch sẽ hàng ngày.'
    },
    {
        code: '101029 / 101030',
        title: 'Lỗi Khóa Thanh An Toàn (Roll-bar Buffer Issue)',
        type: 'hardware',
        symptom: 'Roll-bar báo chưa đóng dù thợ sơn đã sập thanh chắn xuống',
        cause: 'Cảm biến nam châm từ tính định vị thanh roll-bar bị bám nhiều bụi sắt, dơ bẩn hoặc bị lệch vị trí khiến tiếp điểm không đóng.',
        steps: [
            'Lau chùi sạch sẽ bề mặt cảm biến tiếp xúc từ trên thanh roll-bar.',
            'Kiểm tra vị trí căn thẳng của miếng từ tiếp xúc.',
            'Nếu cảm biến hỏng, đấu nối tắt tạm thời hoặc tiến hành thay thế cảm biến từ mới.'
        ],
        warning: 'Không khuyến khích đấu tắt cảm biến lâu dài vì sẽ làm mất tính năng an toàn dừng khẩn cấp khi người dùng đưa tay vào máy đang chạy.'
    },
    {
        code: 'Bottle Collapsing',
        title: 'Móp Chai Sơn Khi Vận Hành (Bottle Collapsing)',
        type: 'pump',
        symptom: 'Chai nhựa đựng sơn bị co móp, co rút méo mó trong quá trình bơm sơn tự động',
        cause: 'Van mỏ vịt cao su (duckbill valve) một chiều trên nắp bơm bị nghẹt sơn khô, ngăn không khí tràn vào chai để cân bằng áp suất khi sơn bị hút ra ngoài.',
        steps: [
            'Tháo chai sơn bị móp ra ngoài.',
            'Sử dụng tăm hoặc kim nhỏ chọc nhẹ vào khe nứt của van mỏ vịt trên nắp bơm để làm sạch cặn sơn bám dính.',
            'Bóp nhẹ đầu van để đảm bảo van đóng mở linh hoạt và không khí có thể đi vào một chiều.',
            'Nếu van mỏ vịt đã bị lão hóa, cứng hoặc rách, thay thế bằng van mỏ vịt mới (mã linh kiện 4044486).'
        ],
        warning: 'Định kỳ kiểm tra các van mỏ vịt khi thay chai sơn để tránh hiện tượng móp làm sai lệch kết quả pha.'
    },
    {
        code: 'Leaking Bottle Neck',
        title: 'Rò Rỉ Sơn Tại Cổ Chai (Leaking Bottle Neck)',
        type: 'pump',
        symptom: 'Sơn chảy tràn bám dính quanh cổ chai và đầu kẹp bơm',
        cause: 'Gioăng cao su cổ chai (bottle gasket V3) bị rách, mòn, hoặc lắp nắp bơm bị lệch ren khiến sơn rò rỉ ra ngoài dưới áp lực nén khí.',
        steps: [
            'Rút chai sơn bị rò rỉ ra.',
            'Lau sạch toàn bộ sơn bám dính trên đầu bơm và cổ chai bằng khăn ẩm.',
            'Kiểm tra gioăng cao su đệm cổ chai (bottle gasket). Nếu thấy bị nứt hoặc rách, thay gioăng mới (mã 4046092).',
            'Xoáy chặt nắp kẹp bơm khớp với ren cổ chai một cách chắc chắn.'
        ],
        warning: 'Vệ sinh sạch sơn rò rỉ ngay lập tức vì sơn khô sẽ làm kẹt các chi tiết máy trượt trên carriage.'
    }
];

const PARTS_DATA = [
    { code: '211967', desc: 'Cảm biến quang học hình chữ U (Optic Fork)' },
    { code: '4044486', desc: 'Van mỏ vịt cao su chống co móp chai (Duckbill valve)' },
    { code: '4046092', desc: 'Gioăng cao su đệm cổ chai chống rò rỉ (V3 Bottle gasket)' },
    { code: '4052373', desc: 'Tấm chắn giọt sơn đầu phun (Splash guard - bộ 5 cái)' },
    { code: '212116', desc: 'Bộ ống khí + van mỏ vịt cho bơm cỡ 0.5 lít' },
    { code: '212117', desc: 'Bộ ống khí + van mỏ vịt cho bơm cỡ 1.0 lít' },
    { code: '212118', desc: 'Bộ ống khí + van mỏ vịt cho bơm cỡ 2.0 lít' },
    { code: '216397', desc: 'Cụm bơm sơn 0.5 lít (không kèm tay gạt)' },
    { code: '216398', desc: 'Cụm bơm sơn 1.0 lít (không kèm tay gạt)' },
    { code: '216399', desc: 'Cụm bơm sơn 2.0 lít (không kèm tay gạt)' },
    { code: '214251', desc: 'Cụm nắp kính bảo vệ mặt trước (Plexiglass assembly)' },
    { code: '4004674', desc: 'Cảm biến tiệm cận vòi phun (Sensor proximity)' },
    { code: '4021660', desc: 'Bo mạch điều khiển chính (PCB board 4G dualslot)' },
    { code: '801253', desc: 'Bộ khung cẩu nâng hỗ trợ lắp đặt (Lifter for installation)' }
];

const CHECKLISTS = {
    daily: {
        title: "Vận Hành & Vệ Sinh Hàng Ngày (Daily Checklist)",
        morning: [
            "Mở cả 3 rèm cuốn (roller blinds) của máy pha sơn lên hoàn toàn.",
            "Đóng kính cửa kính phía trước máy và đóng kín roll bar.",
            "Bấm nút công tắc màu XANH LÁ (Green Button) để bật nguồn máy.",
            "Bật máy tính PC, phần mềm MoonWalk và PaintManager XI sẽ tự động khởi động.",
            "Kiểm tra trực quan: Đảm bảo không có vật thể lạ trong khoang pha và trên cân Sartorius."
        ],
        nozzle_cleaning: [
            "Không sử dụng các công cụ sắc nhọn, bàn chải cứng để cạo/vệ sinh đầu phun.",
            "Chỉ sử dụng khăn ướt mềm (wet wipe/towel) để lau sạch sơn bám xung quanh vòi phun trước và sau khi lắp chai sơn mới."
        ],
        evening: [
            "Tắt máy tính PC thông qua hệ điều hành Windows trước.",
            "Bấm tắt nguồn máy pha sơn bằng cách tắt công tắc chính màu XANH LÁ.",
            "Đóng toàn bộ rèm cuốn lại để ngăn bụi bẩn bám vào linh kiện và các chai sơn bên trong máy."
        ]
    },
    annual: {
        title: "Bảo Trì Định Kỳ Năm (Annual Maintenance Checklist)",
        pre_check: [
            "Dispense unit fixed to the wall / Bộ phận pha cố định vào tường.",
            "Storage unit fixed to the wall / Tủ chứa được cố định vào tường.",
            "Machine leveled horizontal / Máy được cân bằng ngang.",
            "Safety door functional / Cửa trượt an toàn hoạt động.",
            "Roller blinds functional / Cửa cuốn bảo vệ hoạt động.",
            "Working internet available / Có kết nối internet hoạt động.",
            "Roll-bar locker installed/functional / Khóa rào chắn an toàn hoạt động.",
            "Position TouchMix™ monitor / Vị trí màn hình TouchMix™.",
            "Earth wire to TouchMix / Dây tiếp địa kết nối TouchMix.",
            "Spectro connected to TouchMix / Máy đo màu kết nối TouchMix."
        ],
        pumps: [
            "Possible damage or leakage check / Có hư hại hoặc rò rỉ sơn cụm bơm.",
            "Pump components intact / Các linh kiện đầu bơm còn nguyên vẹn.",
            "Barcode label properly aligned / Nhãn mã vạch chai màu căn thẳng hàng.",
            "Three spare pumps available / Đầy đủ 3 cụm bơm dự phòng trên khay.",
            "Checked valve rotation (all pumps) / Kiểm tra van cơ học xoay.",
            "Checked metal disc movement (all pumps) / Kiểm tra đĩa kim loại kích bơm.",
            "Checked manual dispensing (all pumps) / Kiểm tra pha thử sơn thủ công.",
            "Cleaned dispensing nozzle (all pumps) / Vệ sinh đầu phun bơm sơn."
        ],
        carriage: [
            "Possible damage on rail/belt / Có hư hại trên ray hoặc dây đai kéo.",
            "Linear motor/coupling fixed / Động cơ tuyến tính khớp nối siết chặt.",
            "USB connection fixed / Kết nối cáp dữ liệu USB cố định chắc chắn.",
            "Smooth/quiet carriage movement / Khung trượt di chuyển mượt mà, êm ái.",
            "Optical sensors aligned / Cảm biến quang thẳng hàng, sạch bụi.",
            "Adjusted and checked the belt tension / Căn chỉnh & đo độ căng dây curoa (Hz).",
            "Check 4 screws on OPTIC FORK joint / Kiểm tra 4 ốc vít khớp nối cảm biến chữ U.",
            "Levelled the scale / Đã cân bằng đĩa cân Sartorius.",
            "Cleaned the drip plates / Đã vệ sinh sạch sẽ tấm hứng giọt sơn.",
            "Cleaned the plexiglass cover / Đã lau nắp che mica bảo vệ máy."
        ],
        software_and_test: [
            "Checked/updated software and firmware / Đã kiểm tra/cập nhật phần mềm và firmware máy.",
            "Checked toner level indication/recirculation / Đã kiểm tra chỉ báo lượng sơn/tuần hoàn chai sơn.",
            "Made 2 successful formula's / Đã pha thành công 2 công thức sơn kiểm tra cùng khách.",
            "Downloaded error report/backup file / Tải báo cáo lỗi máy & sao lưu cấu hình hệ thống."
        ]
    }
};

// 2. Active client connections (SSE)
const clients = new Map();

// Helper to send SSE events
function sendSSEEvent(clientId, eventName, data) {
    const client = clients.get(clientId);
    if (!client) return false;
    
    client.res.write(`event: ${eventName}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
}

// 3. HTTP Request Router
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // A. Endpoint GET /sse
    if (pathname === '/sse' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Prevent proxy buffering
        });

        const clientId = crypto.randomUUID();
        clients.set(clientId, { res });

        console.log(`Client connected: ${clientId}`);

        // Send immediately connection endpoint details
        // Note: standard MCP over SSE sends the POST url in the "connect" event
        const baseUrl = process.env.BASE_URL || `http://${req.headers.host || 'localhost:3000'}`;
        res.write(`event: endpoint\n`);
        res.write(`data: ${baseUrl}/message?clientId=${clientId}\n\n`);

        req.on('close', () => {
            console.log(`Client disconnected: ${clientId}`);
            clients.delete(clientId);
        });
        return;
    }

    // B. Endpoint POST /message
    if (pathname === '/message' && req.method === 'POST') {
        const clientId = parsedUrl.query.clientId;
        
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const requestObj = JSON.parse(body);
                console.log(`Received MCP request from client [${clientId || 'unknown'}]:`, JSON.stringify(requestObj));
                
                // Process the JSON-RPC request
                const responseObj = handleJSONRPC(requestObj);

                // Send response back
                // 1. Through the open SSE stream (standard MCP spec)
                if (clientId && clients.has(clientId)) {
                    sendSSEEvent(clientId, 'message', responseObj);
                }

                // 2. Also directly in the POST response (bullet-proof fallback)
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(responseObj));
            } catch (err) {
                console.error("Error processing request:", err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: "2.0",
                    error: { code: -32700, message: "Parse error" },
                    id: null
                }));
            }
        });
        return;
    }

    // C. Health Check and Info Home Page
    if (pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>MoonWalk MCP Server</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; background: #f8fafc; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                    h1 { color: #1e3a8a; margin-top: 0; }
                    .status { display: inline-block; padding: 4px 10px; border-radius: 20px; font-weight: bold; background: #dcfce7; color: #166534; font-size: 0.85em; }
                    .url-box { background: #f1f5f9; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 1.1em; word-break: break-all; margin: 15px 0; border: 1px solid #cbd5e1; }
                    ul { padding-left: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>PPG MoonWalk™ MCP Server</h1>
                    <div>Status: <span class="status">ONLINE / HOẠT ĐỘNG</span></div>
                    <p>Đây là máy chủ kết nối ứng dụng tuân thủ giao thức <strong>Model Context Protocol (MCP)</strong>.</p>
                    <p>Sử dụng liên kết dưới đây để kết nối với Gemini Spark / Gemini Advanced:</p>
                    <div class="url-box">http://${req.headers.host || 'localhost:3000'}/sse</div>
                    <h3>Các công cụ được cung cấp:</h3>
                    <ul>
                        <li><code>search_errors</code>: Tìm kiếm mã lỗi/triệu chứng của MoonWalk.</li>
                        <li><code>check_installation</code>: Kiểm tra tính khả thi kích thước phòng lắp đặt.</li>
                        <li><code>get_part</code>: Tra cứu mã số linh kiện hao mòn.</li>
                        <li><code>get_checklists</code>: Lấy quy trình kiểm tra bảo trì hàng ngày/năm.</li>
                    </ul>
                </div>
            </body>
            </html>
        `);
        return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "Not Found" }));
});

// 4. JSON-RPC Protocol Handler
function handleJSONRPC(request) {
    const { jsonrpc, id, method, params } = request;
    
    if (jsonrpc !== "2.0") {
        return {
            jsonrpc: "2.0",
            error: { code: -32600, message: "Invalid Request" },
            id: id || null
        };
    }

    switch (method) {
        // Handshake initialization
        case 'initialize':
            return {
                jsonrpc: "2.0",
                id: id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: {}
                    },
                    serverInfo: {
                        name: "moonwalk-mcp-server",
                        version: "1.0.0"
                    }
                }
            };

        case 'initialized':
            return {
                jsonrpc: "2.0",
                id: id,
                result: {}
            };

        // List Tools
        case 'tools/list':
            return {
                jsonrpc: "2.0",
                id: id,
                result: {
                    tools: [
                        {
                            name: "search_errors",
                            description: "Tìm kiếm mã lỗi MoonWalk (ví dụ: 101000, 100094, DE02375) hoặc triệu chứng lỗi (móp chai, rò rỉ) để lấy nguyên nhân và các bước sửa chữa.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: {
                                        type: "string",
                                        description: "Mã lỗi số hoặc từ khóa triệu chứng (ví dụ: 101000, móp chai)."
                                    }
                                },
                                required: ["query"]
                            }
                        },
                        {
                            name: "check_installation",
                            description: "Kiểm tra tính khả thi lắp đặt thiết bị MoonWalk dựa trên kích thước phòng sơn của khách hàng.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    doorWidth: {
                                        type: "number",
                                        description: "Chiều rộng khung cửa ra vào (cm)."
                                    },
                                    roomDepth: {
                                        type: "number",
                                        description: "Chiều sâu phòng pha sơn thực tế (cm)."
                                    },
                                    ceilingHeight: {
                                        type: "number",
                                        description: "Chiều cao trần phòng pha sơn (cm)."
                                    }
                                },
                                required: ["doorWidth", "roomDepth", "ceilingHeight"]
                            }
                        },
                        {
                            name: "get_part",
                            description: "Tra cứu mã linh kiện hoặc tên linh kiện hao mòn chính hãng của MoonWalk.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: {
                                        type: "string",
                                        description: "Tên linh kiện hoặc mã số linh kiện cần tra cứu (ví dụ: van mỏ vịt, 211967)."
                                    }
                                },
                                required: ["query"]
                            }
                        },
                        {
                            name: "get_checklists",
                            description: "Xem các checklist hướng dẫn vận hành hàng ngày hoặc biểu mẫu bảo trì năm.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    type: {
                                        type: "string",
                                        enum: ["daily", "annual"],
                                        description: "Loại checklist cần lấy ('daily' - Hàng ngày, 'annual' - Định kỳ năm)."
                                    }
                                },
                                required: ["type"]
                            }
                        }
                    ]
                }
            };

        // Call Tool
        case 'tools/call':
            const { name, arguments: args } = params || {};
            return {
                jsonrpc: "2.0",
                id: id,
                result: executeToolCall(name, args)
            };

        default:
            return {
                jsonrpc: "2.0",
                error: { code: -32601, message: `Method not found: ${method}` },
                id: id
            };
    }
}

// 5. Tool Call Execution Logic
function executeToolCall(name, args) {
    switch (name) {
        case 'search_errors':
            const q = (args.query || '').toLowerCase().trim();
            const errorsFound = TROUBLE_DATA.filter(err => 
                err.code.toLowerCase().includes(q) || 
                err.title.toLowerCase().includes(q) || 
                err.symptom.toLowerCase().includes(q) ||
                err.cause.toLowerCase().includes(q)
            );
            
            if (errorsFound.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Không tìm thấy thông tin khớp cho từ khóa: "${args.query}". Vui lòng thử tìm với mã lỗi khác (ví dụ: 101000, 100094, DE02375) hoặc triệu chứng khác.`
                    }]
                };
            }

            const formattedErrors = errorsFound.map(err => {
                return `**Mã Lỗi / Triệu Chứng:** ${err.code}\n` +
                       `**Tên Lỗi:** ${err.title}\n` +
                       `**Nguyên nhân:** ${err.cause}\n` +
                       `**Các bước xử lý:**\n${err.steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}\n` +
                       `⚠️ **Cảnh báo:** ${err.warning}\n` +
                       `------------------------------------`;
            }).join('\n\n');

            return {
                content: [{
                    type: "text",
                    text: `### Kết quả tra cứu lỗi MoonWalk:\n\n${formattedErrors}`
                }]
            };

        case 'check_installation':
            const dw = args.doorWidth;
            const rd = args.roomDepth;
            const ch = args.ceilingHeight;
            const issues = [];
            
            if (dw < 75) {
                issues.push("- Chiều rộng cửa mở khóa nhỏ hơn 75 cm (Không thể di chuyển máy vào phòng).");
            }
            
            // Check depth rule
            let minDepth = 200;
            if (dw >= 75 && dw < 80) minDepth = 265;
            else if (dw >= 80 && dw < 85) minDepth = 230;
            else if (dw >= 85 && dw < 90) minDepth = 210;
            else minDepth = 200;

            if (rd < minDepth) {
                issues.push(`- Chiều sâu phòng hiện tại (${rd}cm) nhỏ hơn tiêu chuẩn tối thiểu (${minDepth}cm) ứng với chiều rộng cửa là ${dw}cm.`);
            }

            if (ch < 210) {
                issues.push("- Chiều cao trần phòng sơn nhỏ hơn 210 cm (Chiều cao máy MoonWalk tối thiểu cần 210 cm để đặt đứng và mở tủ trên).");
            }

            const isPossible = issues.length === 0;

            return {
                content: [{
                    type: "text",
                    text: `### ĐÁNH GIÁ MẶT BẰNG LẮP ĐẶT MOONWALK™:\n\n` +
                           `*   **Kích thước đo đạc:** Cửa rộng: ${dw}cm | Phòng sâu: ${rd}cm | Trần cao: ${ch}cm\n` +
                           `*   **Yêu cầu độ sâu tối thiểu:** ${minDepth} cm\n` +
                           `*   **Kết luận:** ${isPossible ? '🟢 ĐỦ ĐIỀU KIỆN LẮP ĐẶT (Possible)' : '🔴 KHÔNG ĐỦ ĐIỀU KIỆN LẮP ĐẶT (Impossible)'}\n\n` +
                           (isPossible ? 'Mặt bằng phòng pha sơn đạt tiêu chuẩn để vận chuyển và vận hành máy MoonWalk an toàn.' : `**Các vấn đề phát hiện:**\n${issues.join('\n')}`)
                }]
            };

        case 'get_part':
            const pq = (args.query || '').toLowerCase().trim();
            const partsFound = PARTS_DATA.filter(p => 
                p.code.toLowerCase().includes(pq) || 
                p.desc.toLowerCase().includes(pq)
            );

            if (partsFound.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Không tìm thấy linh kiện nào khớp với từ khóa: "${args.query}".`
                    }]
                };
            }

            const formattedParts = partsFound.map(p => `- **Mã số:** \`${p.code}\` | **Tên linh kiện:** ${p.desc}`).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `### Danh sách linh kiện MoonWalk tìm thấy:\n\n${formattedParts}`
                }]
            };

        case 'get_checklists':
            const type = args.type;
            if (type === 'daily') {
                return {
                    content: [{
                        type: "text",
                        text: `### ${CHECKLISTS.daily.title}\n\n` +
                               `🌅 **Buổi sáng (Morning):**\n${CHECKLISTS.daily.morning.map(s => `- ${s}`).join('\n')}\n\n` +
                               `🔧 **Vệ sinh đầu phun (Nozzle Clean):**\n${CHECKLISTS.daily.nozzle_cleaning.map(s => `- ${s}`).join('\n')}\n\n` +
                               `🌃 **Buổi tối (Evening):**\n${CHECKLISTS.daily.evening.map(s => `- ${s}`).join('\n')}`
                    }]
                };
            } else {
                return {
                    content: [{
                        type: "text",
                        text: `### ${CHECKLISTS.annual.title}\n\n` +
                               `📋 **Kiểm tra môi trường trước bảo trì (Pre-check):**\n${CHECKLISTS.annual.pre_check.map(s => `- ${s}`).join('\n')}\n\n` +
                               `🧪 **Kiểm tra cụm bơm sơn (Pumps check):**\n${CHECKLISTS.annual.pumps.map(s => `- ${s}`).join('\n')}\n\n` +
                               `⚙️ **Kiểm tra khung trượt (Carriage check):**\n${CHECKLISTS.annual.carriage.map(s => `- ${s}`).join('\n')}\n\n` +
                               `💻 **Cập nhật phần mềm & Test thực tế:**\n${CHECKLISTS.annual.software_and_test.map(s => `- ${s}`).join('\n')}`
                    }]
                };
            }

        default:
            return {
                content: [{
                    type: "text",
                    text: `Tool ${name} executed successfully with no custom formatter.`
                }]
            };
    }
}

// 6. Start the server
server.listen(PORT, () => {
    console.log(`PPG MoonWalk MCP Server running at: http://localhost:${PORT}`);
    console.log(`SSE connection endpoint available at: http://localhost:${PORT}/sse`);
});
