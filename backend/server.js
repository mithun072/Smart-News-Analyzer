import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Health check endpoint
app.get('api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to verify API keys
app.get('/api/test', (req, res) => {
  res.json({
    newsApiConfigured: !!process.env.NEWS_API_KEY,
    geminiApiConfigured: !!process.env.GEMINI_API_KEY,
    port: PORT
  });
});

// Fetch news from News API
app.get('/api/news', async (req, res) => {
  try {
    const { category = 'general', country = 'us', pageSize = 10 } = req.query;
    
    // Check if API key is configured
    if (!process.env.NEWS_API_KEY) {
      return res.status(500).json({ 
        error: 'NEWS_API_KEY not configured in .env file' 
      });
    }
    
    console.log(`Fetching news: category=${category}, country=${country}, pageSize=${pageSize}`);
    
    const response = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: {
        country,
        category,
        pageSize,
        apiKey: process.env.NEWS_API_KEY
      }
    });

    console.log(`✅ Fetched ${response.data.articles?.length || 0} articles`);
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Error fetching news:', error.response?.data || error.message);
    
    // Send detailed error information
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch news',
      details: error.response?.data?.message || error.message,
      code: error.response?.data?.code || 'UNKNOWN_ERROR'
    });
  }
});

// Analyze article with Gemini AI
// Analyze article with Gemini AI
app.post('/api/analyze', async (req, res) => {
  try {
    const { title, description, content } = req.body;

    // Validate input
    if (!title && !description && !content) {
      return res.status(400).json({ 
        error: 'No content provided. Please provide at least title, description, or content.' 
      });
    }

    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY is not set in .env file');
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY not configured in .env file',
        hint: 'Get your key at https://makersuite.google.com/app/apikey'
      });
    }

    console.log('🤖 Analyzing article with Gemini AI...');
    console.log('📝 Title:', title?.substring(0, 50) + '...');

    // Prepare article text
    const articleText = `
Title: ${title || 'N/A'}
Description: ${description || 'N/A'}
Content: ${content || 'N/A'}
    `.trim();

    try {
      // Initialize Gemini model
 const model = genAI.getGenerativeModel({ model: 'gemini-pro-latest' });

      // Create analysis prompt
      const prompt = `Analyze this news article and respond with ONLY a JSON object (no markdown, no extra text):

{
  "summary": "2-3 sentence summary here",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "sentiment": {
    "type": "Positive or Negative or Neutral",
    "explanation": "why this sentiment"
  },
  "tone": "the article's tone",
  "biasDetection": "bias analysis or 'No significant bias detected'"
}

Article to analyze:
${articleText}`;

      console.log('📤 Sending request to Gemini...');

      // Generate content with Gemini with timeout
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Gemini API timeout after 30s')), 30000)
        )
      ]);

      const response = await result.response;
      const text = response.text();

      console.log('📥 Received response from Gemini');
      console.log('📄 Raw response preview:', text.substring(0, 100) + '...');

      // Parse JSON response
      let analysis;
      try {
        // Clean up the response
        let cleanText = text.trim();
        
        // Remove markdown code blocks
        cleanText = cleanText.replace(/```json\s*/g, '');
        cleanText = cleanText.replace(/```\s*/g, '');
        
        // Remove any leading/trailing whitespace
        cleanText = cleanText.trim();
        
        // Try to find JSON object if there's extra text
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanText = jsonMatch[0];
        }
        
        analysis = JSON.parse(cleanText);
        
        // Validate the structure
        if (!analysis.summary) {
          throw new Error('Missing summary in response');
        }
        
        // Ensure all fields exist
        analysis = {
          summary: analysis.summary || 'No summary available',
          keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints : [],
          sentiment: analysis.sentiment || { type: 'Neutral', explanation: 'Not analyzed' },
          tone: analysis.tone || 'Not specified',
          biasDetection: analysis.biasDetection || 'Not analyzed'
        };
        
        console.log('✅ Analysis completed and parsed successfully');
        
      } catch (parseError) {
        console.warn('⚠️  JSON parsing failed:', parseError.message);
        console.log('Attempting to create structured response from text...');
        
        // Fallback: Create basic analysis from the text
        analysis = {
          summary: text.length > 500 ? text.substring(0, 500) + '...' : text,
          keyPoints: [
            'AI analysis completed',
            'Response could not be fully parsed',
            'See summary for full details'
          ],
          sentiment: { 
            type: 'Neutral', 
            explanation: 'Automatic sentiment parsing unavailable' 
          },
          tone: 'Informative',
          biasDetection: 'Could not perform automatic bias detection'
        };
      }

      res.json(analysis);

    } catch (geminiError) {
      // Specific Gemini API errors
      console.error('❌ Gemini API Error:', geminiError);
      
      let errorMessage = 'Failed to analyze with Gemini AI';
      let errorDetails = geminiError.message;
      let errorHint = '';

      // Check for specific error types
      if (geminiError.message?.includes('API key')) {
        errorMessage = 'Invalid Gemini API Key';
        errorHint = 'Please check your GEMINI_API_KEY in .env file. Get a key at https://makersuite.google.com/app/apikey';
      } else if (geminiError.message?.includes('quota')) {
        errorMessage = 'API Quota Exceeded';
        errorHint = 'You have exceeded your Gemini API quota. Wait a few minutes or check your quota at https://makersuite.google.com/';
      } else if (geminiError.message?.includes('timeout')) {
        errorMessage = 'Request Timeout';
        errorHint = 'The AI took too long to respond. Try with a shorter article.';
      } else if (geminiError.message?.includes('model not found')) {
        errorMessage = 'Model Not Available';
        errorHint = 'The gemini-pro model might not be available in your region.';
      }

      return res.status(500).json({ 
        error: errorMessage,
        details: errorDetails,
        hint: errorHint
      });
    }
    
  } catch (error) {
    console.error('❌ Server Error:', error);
    
    res.status(500).json({ 
      error: 'Server error during analysis',
      details: error.message,
      type: error.name
    });
  }
});

// Search news by keyword
app.get('/api/search', async (req, res) => {
  try {
    const { q, pageSize = 10, language = 'en' } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        error: 'Search query parameter "q" is required' 
      });
    }
    
    if (!process.env.NEWS_API_KEY) {
      return res.status(500).json({ 
        error: 'NEWS_API_KEY not configured in .env file' 
      });
    }
    
    console.log(`🔍 Searching news for: "${q}"`);
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q,
        pageSize,
        language,
        sortBy: 'publishedAt',
        apiKey: process.env.NEWS_API_KEY
      }
    });

    console.log(`✅ Found ${response.data.articles?.length || 0} articles`);
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Error searching news:', error.response?.data || error.message);
    
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to search news',
      details: error.response?.data?.message || error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/test',
      'GET /api/news?category=<category>&country=<country>&pageSize=<size>',
      'POST /api/analyze',
      'GET /api/search?q=<query>&pageSize=<size>'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 ================================');
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  console.log('🔗 Available Endpoints:');
  console.log(`   - GET  ${PORT}/api/health`);
  console.log(`   - GET  ${PORT}/api/test`);
  console.log(`   - GET  ${PORT}/api/news`);
  console.log(`   - POST ${PORT}/api/analyze`);
  console.log(`   - GET  ${PORT}/api/search`);
  console.log('================================\n');
  
  // Verify environment variables
  const newsApiStatus = process.env.NEWS_API_KEY ? '✅' : '❌';
  const geminiApiStatus = process.env.GEMINI_API_KEY ? '✅' : '❌';
  
  console.log('🔑 API Keys Status:');
  console.log(`   ${newsApiStatus} NEWS_API_KEY: ${process.env.NEWS_API_KEY ? 'Configured' : 'NOT FOUND'}`);
  console.log(`   ${geminiApiStatus} GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Configured' : 'NOT FOUND'}`);
  console.log('================================\n');
  
  // Warnings
  if (!process.env.NEWS_API_KEY) {
    console.warn('⚠️  WARNING: NEWS_API_KEY not found in .env file!');
    console.warn('   Get your key at: https://newsapi.org/\n');
  }
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  WARNING: GEMINI_API_KEY not found in .env file!');
    console.warn('   Get your key at: https://ai.google.dev/\n');
  }
  
  if (process.env.NEWS_API_KEY && process.env.GEMINI_API_KEY) {
    console.log('✨ All systems ready! You can now use the application.\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});
