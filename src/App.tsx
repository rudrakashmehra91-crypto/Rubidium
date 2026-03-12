import React, { useState, KeyboardEvent, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Image as ImageIcon, Sparkles, Download, Share2, Check, Wand2, Heart, Plus, X, Camera, Upload, Moon, Sun } from 'lucide-react';

interface FavoriteImage {
  id: string;
  url: string;
  prompt: string;
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [style, setStyle] = useState('none');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [variationIndex, setVariationIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ url: string, base64: string, mimeType: string } | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [activeTab, setActiveTab] = useState<'generate' | 'favorites'>('generate');
  const [favorites, setFavorites] = useState<FavoriteImage[]>(() => {
    try {
      const saved = localStorage.getItem('ai-image-favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('ai-image-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (url: string, imagePrompt: string) => {
    setFavorites(prev => {
      const exists = prev.find(f => f.url === url);
      if (exists) {
        return prev.filter(f => f.url !== url);
      }
      return [{ id: Date.now().toString(), url, prompt: imagePrompt }, ...prev];
    });
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      let finalPrompt = style === 'none' ? prompt : `${prompt}, ${style} style`;
      if (negativePrompt.trim()) {
        finalPrompt += `\nDo not include: ${negativePrompt.trim()}`;
      }

      const parts: any[] = [];
      if (referenceImage) {
        parts.push({
          inlineData: {
            data: referenceImage.base64,
            mimeType: referenceImage.mimeType,
          },
        });
      }
      parts.push({ text: finalPrompt });

      // Use the free Gemini API key from the environment
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: parts,
          },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any,
            },
          },
        });

        if (response.candidates && response.candidates[0]?.content?.parts) {
          const newUrls: string[] = [];
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              const base64EncodeString = part.inlineData.data;
              newUrls.push(`data:image/png;base64,${base64EncodeString}`);
              break;
            }
          }
          
          if (newUrls.length === 0) {
            setError('No images were generated. Please try a different prompt.');
          } else {
            setImageUrls(newUrls);
          }
        }
      } catch (e: any) {
        console.error(`Failed to generate image:`, e);
        throw e;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating the image.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateImage();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      setReferenceImage({
        url: URL.createObjectURL(file),
        base64: base64Data,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again if removed
    e.target.value = '';
  };

  const handleDownload = (url: string, index: number) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-image-${Date.now()}-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = (urls: string[]) => {
    urls.forEach((url, index) => {
      setTimeout(() => handleDownload(url, index), index * 200);
    });
  };

  const handleShare = async (url: string) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], 'ai-image.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'AI Generated Image',
          text: `Generated with prompt: "${prompt}"`,
          files: [file],
        });
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        setShareFeedback('Image copied to clipboard!');
        setTimeout(() => setShareFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleGenerateVariations = async (index: number, url: string) => {
    setVariationIndex(index);
    setIsLoading(true);
    setError(null);

    try {
      let finalPrompt = style === 'none' ? prompt : `${prompt}, ${style} style`;
      if (negativePrompt.trim()) {
        finalPrompt += `\nDo not include: ${negativePrompt.trim()}`;
      }

      const base64Data = url.split(',')[1];
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/png',
                },
              },
              {
                text: `Generate a variation of this image. ${finalPrompt}`,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any,
            },
          },
        });

        if (response.candidates && response.candidates[0]?.content?.parts) {
          const newUrls: string[] = [];
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              const base64EncodeString = part.inlineData.data;
              newUrls.push(`data:image/png;base64,${base64EncodeString}`);
              break;
            }
          }
          
          if (newUrls.length === 0) {
            setError('No variations were generated. Please try again.');
          } else {
            setImageUrls(newUrls);
          }
        }
      } catch (e: any) {
        console.error(`Failed to generate variation:`, e);
        throw e;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating variations.');
    } finally {
      setIsLoading(false);
      setVariationIndex(null);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden transition-colors duration-500 ${isDarkMode ? 'bg-[#1a1a2e] text-zinc-50' : 'bg-[#f8f9fa] text-[#343a40]'}`}>
      
      {/* Top Bar Actions */}
      <div className="absolute top-6 right-6 flex items-center gap-4 z-50">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`p-2.5 rounded-full shadow-lg transition-all duration-500 hover:scale-110 active:scale-95 ${
            isDarkMode 
              ? 'bg-[#8a2be2] text-white hover:bg-[#9b4dca] shadow-[#8a2be2]/20' 
              : 'bg-[#f8f9fa] text-[#343a40] hover:bg-white border border-gray-200 shadow-gray-200/50'
          }`}
          title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode`}
        >
          <div className="relative w-5 h-5">
            <Sun 
              className={`absolute inset-0 w-5 h-5 transition-all duration-500 transform ${
                isDarkMode ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
              }`} 
            />
            <Moon 
              className={`absolute inset-0 w-5 h-5 transition-all duration-500 transform ${
                isDarkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
              }`} 
            />
          </div>
        </button>
      </div>

      {/* Soft Changing Background Visuals */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className={`absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full blur-[120px] animate-blob transition-colors duration-700 ${isDarkMode ? 'bg-emerald-900/20' : 'bg-emerald-200/40'}`} />
        <div className={`absolute top-[10%] -right-[10%] w-[60%] h-[60%] rounded-full blur-[120px] animate-blob animation-delay-2000 transition-colors duration-700 ${isDarkMode ? 'bg-blue-900/20' : 'bg-blue-200/40'}`} />
        <div className={`absolute -bottom-[20%] left-[20%] w-[80%] h-[80%] rounded-full blur-[120px] animate-blob animation-delay-4000 transition-colors duration-700 ${isDarkMode ? 'bg-cyan-900/20' : 'bg-cyan-200/40'}`} />
      </div>

      <div className="w-full max-w-3xl space-y-8 relative z-10">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className={`inline-flex items-center justify-center p-3 backdrop-blur-sm rounded-2xl border mb-2 shadow-lg transition-colors duration-500 ${isDarkMode ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white/80 border-gray-200'}`}>
            <Sparkles className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className={`text-4xl sm:text-5xl font-display font-bold tracking-tight transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-[#343a40]'}`}>
            Rubidium AI image generation
          </h1>
          <p className={`text-lg max-w-xl mx-auto transition-colors duration-500 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
            Experience high-quality image generation.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-6 py-2.5 rounded-full font-medium transition-all ${
              activeTab === 'generate'
                ? isDarkMode ? 'bg-white text-black shadow-lg' : 'bg-[#343a40] text-white shadow-lg'
                : isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-white text-gray-500 hover:text-[#343a40] hover:bg-gray-50 border border-gray-200'
            }`}
          >
            Generate
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`px-6 py-2.5 rounded-full font-medium transition-all flex items-center gap-2 ${
              activeTab === 'favorites'
                ? isDarkMode ? 'bg-white text-black shadow-lg' : 'bg-[#343a40] text-white shadow-lg'
                : isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-white text-gray-500 hover:text-[#343a40] hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <Heart className={`w-4 h-4 ${activeTab === 'favorites' ? (isDarkMode ? 'fill-black' : 'fill-white') : ''}`} />
            Favorites {favorites.length > 0 && `(${favorites.length})`}
          </button>
        </div>

        {activeTab === 'generate' ? (
          <>
            {/* Input Area */}
        <div className={`border rounded-3xl p-2 backdrop-blur-sm shadow-xl transition-all duration-500 ${isDarkMode ? 'bg-zinc-900/50 border-zinc-800 focus-within:border-zinc-700 focus-within:bg-zinc-900' : 'bg-white/50 border-gray-200 focus-within:border-gray-300 focus-within:bg-white'}`}>
          {referenceImage && (
            <div className={`relative w-20 h-20 ml-4 mt-2 mb-2 rounded-xl overflow-hidden border group ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
              <img src={referenceImage.url} alt="Reference" className="w-full h-full object-cover" />
              <button
                onClick={() => setReferenceImage(null)}
                className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          <div className="relative flex items-center">
            <div className="relative" ref={plusMenuRef}>
              <button
                onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                disabled={isLoading}
                className={`ml-2 p-3 rounded-2xl transition-colors disabled:opacity-50 flex-shrink-0 ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-gray-500 hover:text-[#343a40] hover:bg-gray-100'}`}
                title="Add reference image"
              >
                <Plus className={`w-6 h-6 transition-transform ${isPlusMenuOpen ? 'rotate-45' : ''}`} />
              </button>
              
              {isPlusMenuOpen && (
                <div className={`absolute bottom-full left-0 mb-2 w-48 border rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
                  <button
                    onClick={() => {
                      document.getElementById('camera-upload')?.click();
                      setIsPlusMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${isDarkMode ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-gray-600 hover:text-[#343a40] hover:bg-gray-50'}`}
                  >
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </button>
                  <button
                    onClick={() => {
                      document.getElementById('image-upload')?.click();
                      setIsPlusMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left border-t ${isDarkMode ? 'text-zinc-300 hover:text-white hover:bg-zinc-700 border-zinc-700/50' : 'text-gray-600 hover:text-[#343a40] hover:bg-gray-50 border-gray-100'}`}
                  >
                    <Upload className="w-4 h-4" />
                    Upload Image
                  </button>
                </div>
              )}
            </div>
            <input
              type="file"
              id="camera-upload"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageUpload}
            />
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to see..."
              className={`w-full bg-transparent border-none px-4 py-4 text-lg focus:outline-none focus:ring-0 ${isDarkMode ? 'text-white placeholder-zinc-500' : 'text-[#343a40] placeholder-gray-400'}`}
              disabled={isLoading}
            />
            <button
              onClick={generateImage}
              disabled={isLoading || !prompt.trim()}
              className={`absolute right-2 p-3 rounded-2xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ${isDarkMode ? 'bg-white text-black hover:bg-zinc-200' : 'bg-[#343a40] text-white hover:bg-[#212529]'}`}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              <span className="hidden sm:inline pr-2">{isLoading ? 'Generating...' : 'Generate'}</span>
            </button>
          </div>
          
          {/* Options Area */}
          <div className={`px-4 pb-3 pt-2 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border-t mt-2 ${isDarkMode ? 'border-zinc-800/50' : 'border-gray-200'}`}>
            {/* Aspect Ratio Selector */}
            <div className="flex flex-wrap gap-2">
              {[
                { value: '1:1', label: 'Square' },
                { value: '16:9', label: 'Landscape' },
                { value: '9:16', label: 'Portrait' },
                { value: '4:3', label: 'Photo' },
                { value: '3:4', label: 'Vertical' },
              ].map((ratio) => (
                <button
                  key={ratio.value}
                  onClick={() => setAspectRatio(ratio.value)}
                  disabled={isLoading}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    aspectRatio === ratio.value
                      ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-[#343a40] text-white shadow-sm'
                      : isDarkMode ? 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-[#343a40]'
                  }`}
                >
                  {ratio.label} <span className="opacity-60 ml-1">{ratio.value}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-2xl text-sm text-center">
            {error}
          </div>
        )}

        {/* Image Display Area */}
        <div className="mt-8">
          {imageUrls.length > 0 ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => handleDownloadAll(imageUrls)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-[#343a40]'}`}
                >
                  <Download className="w-4 h-4" />
                  Download All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {imageUrls.map((url, index) => {
                const isFavorited = favorites.some(f => f.url === url);
                return (
                <div key={index} className={`relative group rounded-3xl overflow-hidden border shadow-2xl transition-all ${isDarkMode ? 'border-zinc-800 bg-zinc-900 hover:border-zinc-700' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <img
                    src={url}
                    alt={`${prompt} - Image ${index + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-cover aspect-square"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-6">
                    <p className="text-white text-sm font-medium line-clamp-2 max-w-[40%]">
                      {prompt}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleFavorite(url, prompt)}
                        className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors"
                        title={isFavorited ? "Remove from Favorites" : "Save to Favorites"}
                      >
                        <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleGenerateVariations(index, url)}
                        disabled={isLoading}
                        className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors disabled:opacity-50"
                        title="Generate Variations"
                      >
                        {variationIndex === index ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleShare(url)}
                        className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors"
                        title="Share Image"
                      >
                        {shareFeedback ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDownload(url, index)}
                        className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors"
                        title="Download Image"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
            </div>
          ) : (
            <div className={`aspect-square sm:aspect-video rounded-3xl border border-dashed flex flex-col items-center justify-center p-8 text-center transition-colors ${isDarkMode ? 'border-zinc-800 bg-zinc-900/30 text-zinc-500' : 'border-gray-300 bg-gray-50/50 text-gray-400'}`}>
              <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
              <p className={`text-lg font-medium ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No images generated yet</p>
              <p className="text-sm mt-2 max-w-sm">
                Enter a descriptive prompt above and click generate to see the magic happen.
              </p>
            </div>
          )}
        </div>
        </>
        ) : (
          <div className="mt-8">
            {favorites.length > 0 ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    onClick={() => handleDownloadAll(favorites.map(f => f.url))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-[#343a40]'}`}
                  >
                    <Download className="w-4 h-4" />
                    Download All
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {favorites.map((fav) => (
                  <div key={fav.id} className={`relative group rounded-3xl overflow-hidden border shadow-2xl transition-all ${isDarkMode ? 'border-zinc-800 bg-zinc-900 hover:border-zinc-700' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <img
                      src={fav.url}
                      alt={fav.prompt}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-cover aspect-square"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-6">
                      <p className="text-white text-sm font-medium line-clamp-2 max-w-[50%]">
                        {fav.prompt}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleFavorite(fav.url, fav.prompt)}
                          className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors"
                          title="Remove from Favorites"
                        >
                          <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                        </button>
                        <button
                          onClick={() => handleShare(fav.url)}
                          className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors"
                          title="Share Image"
                        >
                          {shareFeedback ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDownload(fav.url, 0)}
                          className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white transition-colors"
                          title="Download Image"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            ) : (
              <div className={`aspect-square sm:aspect-video rounded-3xl border border-dashed flex flex-col items-center justify-center p-8 text-center transition-colors ${isDarkMode ? 'border-zinc-800 bg-zinc-900/30 text-zinc-500' : 'border-gray-300 bg-gray-50/50 text-gray-400'}`}>
                <Heart className="w-12 h-12 mb-4 opacity-50" />
                <p className={`text-lg font-medium ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No favorites yet</p>
                <p className="text-sm mt-2 max-w-sm">
                  Generate some images and click the heart icon to save them here for later.
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Toast Notification */}
      {shareFeedback && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${isDarkMode ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-white text-[#343a40] border-gray-200'}`}>
          <div className="bg-emerald-500/20 p-1 rounded-full">
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-sm font-medium">{shareFeedback}</span>
        </div>
      )}
    </div>
  );
}
