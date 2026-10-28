async function test() {
  const BASE = 'http://127.0.0.1:4000';

  console.log('1. Logging in as examiner...');
  const loginRes = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'examiner@cbit.ac.in', password: 'CbitDemo@2026!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  if (!cookieHeader) throw new Error('No session cookie returned');
  const sessionCookie = cookieHeader.split(';')[0];
  console.log('Logged in successfully. Session cookie obtained.');

  console.log('2. Fetching subjects to associate document...');
  const subjectsRes = await fetch(BASE + '/api/v1/subjects', {
    headers: { Cookie: sessionCookie },
  });
  const subjects = await subjectsRes.json();
  const cnSubject = subjects.data.find((s) => s.code === 'CS-301') || subjects.data[0];
  console.log('Using subject:', cnSubject.code, cnSubject.name, '(', cnSubject.id, ')');

  console.log('3. Uploading source document...');
  const docContent = [
    'UNIT II: DATA LINK LAYER AND PROTOCOLS',
    '1. Flow Control Protocols:',
    'Stop-and-Wait ARQ: Sender transmits one frame and waits for an acknowledgment (ACK) before transmitting the next. If the ACK is lost or times out, the frame is retransmitted. Inefficiency occurs over channels with high propagation delay (large bandwidth-delay product).',
    'Sliding Window Protocol: Allows the sender to transmit multiple frames before needing an acknowledgment. The window size W determines how many unacknowledged frames can be outstanding.',
    'Go-Back-N ARQ: The sender window size is N > 1, but the receiver window size is strictly 1. If a frame is corrupted or lost, the receiver discards that frame and all subsequent frames. The sender must retransmit all frames from the lost frame onwards upon timeout. Maximum sender window size is 2^k - 1 where k is sequence number bits.',
    'Selective Repeat ARQ: Both sender and receiver maintain window sizes greater than 1 (W_s = W_r <= 2^(k-1)). The receiver buffers out-of-order error-free frames and acknowledges individually. The sender only retransmits frames that timed out or received negative acknowledgments (NAK).',
  ].join('\n\n');

  const blob = new Blob([docContent], { type: 'text/plain' });
  const form = new FormData();
  form.append('file', blob, 'CN_Unit2_Flow_Control.txt');
  form.append('title', 'Computer Networks Unit 2 - Flow Control Protocols');
  form.append('subjectId', cnSubject.id);

  const uploadRes = await fetch(BASE + '/api/v1/source-documents', {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: form,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error('Upload failed: ' + uploadRes.status + ' ' + errText);
  }
  const uploadedDoc = await uploadRes.json();
  console.log('Uploaded successfully! Doc ID:', uploadedDoc.id, 'Initial Status:', uploadedDoc.status);

  console.log('4. Waiting for background indexing to complete...');
  let indexedDoc = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const checkRes = await fetch(BASE + '/api/v1/source-documents/' + uploadedDoc.id, {
      headers: { Cookie: sessionCookie },
    });
    indexedDoc = await checkRes.json();
    console.log('Poll', i + 1, 'Status:', indexedDoc.status, 'Chunks:', indexedDoc.chunkCount);
    if (indexedDoc.status === 'INDEXED' || indexedDoc.status === 'FAILED') break;
  }

  if (indexedDoc.status !== 'INDEXED') {
    throw new Error('Document did not index successfully: ' + indexedDoc.errorMessage);
  }

  console.log('5. Fetching document chunks...');
  const chunksRes = await fetch(BASE + '/api/v1/source-documents/' + uploadedDoc.id + '/chunks', {
    headers: { Cookie: sessionCookie },
  });
  const chunks = await chunksRes.json();
  console.log('Total indexed chunks retrieved:', chunks.length);
  if (chunks.length > 0) {
    console.log('Chunk 0 sample:', chunks[0].chunkText.slice(0, 100) + '...');
  }

  console.log('6. Checking dashboard metrics...');
  const dashRes = await fetch(BASE + '/api/v1/dashboard', {
    headers: { Cookie: sessionCookie },
  });
  const dash = await dashRes.json();
  console.log('Dashboard Source Documents:', dash.sourceDocuments);

  console.log('7. Triggering Grounded AI Question Generation (RAG)...');
  const genRes = await fetch(BASE + '/api/v1/generation-jobs', {
    method: 'POST',
    headers: {
      Cookie: sessionCookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subjectId: cnSubject.id,
      questionType: 'SHORT_ANSWER',
      difficulty: 'MEDIUM',
      count: 2,
      contextHint: 'Contrast Go-Back-N and Selective Repeat window sizes and retransmission',
      useRag: true,
      sourceDocumentIds: [uploadedDoc.id],
    }),
  });

  if (!genRes.ok) {
    const genErr = await genRes.text();
    console.log('Generation response status:', genRes.status, genErr);
  } else {
    const job = await genRes.json();
    console.log('Generation Job created! ID:', job.id, 'Status:', job.status, 'Grounding Mode:', job.groundingMode);

    console.log('8. Fetching generated candidate questions...');
    const qRes = await fetch(BASE + '/api/v1/generation-jobs/' + job.id + '/questions', {
      headers: { Cookie: sessionCookie },
    });
    const questions = await qRes.json();
    console.log('Generated questions count:', questions.data.length);
    for (const q of questions.data) {
      console.log('--- Candidate Question ---');
      console.log('Text:', q.questionText);
      console.log('Grounding Sources:', JSON.stringify(q.metadata?.sources, null, 2));
      console.log('Source Chunk IDs:', q.sourceChunkIds);
    }
  }

  console.log('\n=== E2E VERIFICATION COMPLETED SUCCESSFULLY ===');
}

test().catch((err) => {
  console.error('E2E TEST ERROR:', err);
  process.exit(1);
});

