const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/prisma');

const CHATBOT_SERVICE_URL = process.env.CHATBOT_SERVICE_URL || 'http://localhost:5002';

/**
 * Call the Flask chatbot service (RAG: MiniLM retrieval + Gemini generation)
 * Input: message string + session history for conversational context
 * Returns: { response, engine, matched_question, score, is_fallback, tokens_used, recipes }
 */
async function askMeatay(message, history) {
  try {
    const response = await axios.post(`${CHATBOT_SERVICE_URL}/chat`, {
      message,
      history
    }, {
      timeout: 60000
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Chatbot failed');
    }

    return response.data;
  } catch (error) {
    console.error('Error calling chatbot service:', error.message);
    throw { statusCode: 503, message: 'Meatay Assistant est indisponible pour le moment. Réessayez dans quelques instants.' };
  }
}

/**
 * Send a user message: persist it, ask the Flask service,
 * persist the bot reply, return both with the session id.
 */
const sendMessage = async (userId, { message, sessionId }) => {
  const sid = sessionId || uuidv4();

  // Conversation context for Gemini: last messages of this session
  const history = sessionId
    ? await prisma.chatMessage.findMany({
        where: { userId, sessionId: sid },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { content: true, isBot: true },
      }).then((msgs) => msgs.reverse())
    : [];

  const userMessage = await prisma.chatMessage.create({
    data: {
      userId,
      content: message,
      isBot: false,
      sessionId: sid,
    },
  });

  const result = await askMeatay(message, history);

  const botMessage = await prisma.chatMessage.create({
    data: {
      userId,
      content: result.response,
      isBot: true,
      modelUsed: result.engine || 'faq-minilm',
      tokensUsed: result.tokens_used ?? null,
      sessionId: sid,
    },
  });

  return {
    sessionId: sid,
    userMessage,
    botMessage,
    engine: result.engine,
    score: result.score,
    isFallback: result.is_fallback,
    recipes: result.recipes || [],
  };
};

/**
 * Chat history for a user, optionally filtered by session.
 */
const getHistory = async (userId, sessionId) => {
  // Cap: unbounded history grows forever and would eventually blow up
  // the response payload; the 500 most recent messages are plenty for the UI.
  const messages = await prisma.chatMessage.findMany({
    where: {
      userId,
      ...(sessionId ? { sessionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return messages.reverse();
};

/**
 * Delete all chat messages of a user (optionally one session only).
 */
const clearHistory = async (userId, sessionId) => {
  const { count } = await prisma.chatMessage.deleteMany({
    where: {
      userId,
      ...(sessionId ? { sessionId } : {}),
    },
  });

  return { deleted: count };
};

module.exports = { sendMessage, getHistory, clearHistory };
