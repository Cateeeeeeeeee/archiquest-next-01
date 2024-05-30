"use client";

import { getPanorama } from "@/ai/blockade";
import {
  creativeUpscale,
  generateImageFal,
  generateImageToImageFal,
} from "@/ai/fal";
import { getGeminiVision } from "@/ai/gemini";
import { getOpenAICompletion } from "@/ai/openai";
import Panorama from "@/components/Panorama";
import Spinner from "@/components/Spinner";
import { useState, useEffect, useRef } from "react";
import { saveScore } from "@/supabase/supabase";
import EndPage from "./endpage";
import { getGroqCompletion } from "@/ai/groq";

const prompts = [
  "A dense tropical rainforest with towering trees, thick undergrowth, and a variety of colorful plants. The air is humid, and sunlight filters through the canopy, creating dappled patterns on the forest floor. Exotic birds, insects, and small mammals can be seen in their natural habitat.",
  "A vast savanna with golden grasses stretching as far as the eye can see. Scattered acacia trees provide sparse shade, and the sky is a brilliant blue. Herds of zebras, antelopes, and giraffes roam the plains, while lions and other predators lurk in the distance",
  "A cold, snowy arctic tundra with vast expanses of ice and snow. The landscape is dotted with hardy shrubs and lichen, and the sky has a pale, ethereal glow. Polar bears, arctic foxes, and seals can be seen in this frozen wilderness",
];

const musicUrls = [
  'audio/CanopyWhispers.mp3',
  'audio/CoralSerenity.mp3',
  'audio/RainforestRhapsody.mp3',
];

export default function App() {
  const [fetching, setFetching] = useState<boolean>(false);
  const [sceneImg, setSceneImg] = useState<string>("/M3_Photoreal_hdri-hdr_A_dense_tropical_rainforest_1345358637_11062534.hdr");
  const [nextSceneImage, setNextSceneImage] = useState<string>();
  const [upscaledImg, setUpscaledImg] = useState<string>("");
  const [prompt, setPrompt] = useState<string>(prompts[0]);
  const [description, setDescription] = useState<string>("Hold shift and drag to take photos");
  const [placeholderVisible, setPlaceholderVisible] = useState<boolean>(false);
  const [upscaling, setUpscaling] = useState<boolean>(false);
  const [backpack, setBackpack] = useState<string[]>([]);
  const [showBackpack, setShowBackpack] = useState<boolean>(false);
  const [discoveries, setDiscoveries] = useState<string[]>([]);
  const [showDiscoveries, setShowDiscoveries] = useState<boolean>(false);
  const [speciesAnalysis, setSpeciesAnalysis] = useState<string>("");
  const [score, setScore] = useState<number>(0);
  const [selectCount, setSelectCount] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(180);
  const [showEndPage, setShowEndPage] = useState<boolean>(false);

  const backpackRef = useRef<HTMLDivElement>(null);
  const discoveriesRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Handle clicking outside to close the backpack and discovery window
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        backpackRef.current &&
        !backpackRef.current.contains(event.target as Node)
      ) {
        setShowBackpack(false);
      }

      if (
        discoveriesRef.current &&
        !discoveriesRef.current.contains(event.target as Node)
      ) {
        setShowDiscoveries(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    const timer = setInterval(() => {
      setCountdown((prevCountdown) => {
        if (prevCountdown > 0) {
          return prevCountdown - 1;
        } else {
          clearInterval(timer);
          return 0;
        }
      });
    }, 1000);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (sceneImg === "") {
      handleCreate();
    }
    makeNextImage();
  }, [sceneImg]);

  const makeNextImage = async () => {
    const newPrompt =
      "A photograph of " +
      prompt +
      ", possibly containing rare and exotic creatures. Canon EOS 5D Mark IV, 24mm, f/8, 1/250s, ISO 100, 2019";
    const pano = await getPanorama(newPrompt);

    if (pano) {
      setNextSceneImage(pano);
      console.log("got pano");
    }
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = musicUrls[prompts.indexOf(prompt)];
      audioRef.current.play();
    }
  }, [prompt]);

  //Save the score when the countdown ends
  useEffect(() => {
    if (countdown === 0) {
      handleSaveScore();
    }
  }, [countdown]);

  const handleCreate = async () => {
    if(nextSceneImage){
      setSceneImg(nextSceneImage);
      return;
    }
    setFetching(true);
    const newPrompt =
      "A photograph of " +
      prompt +
      ", possibly containing rare and exotic creatures. Canon EOS 5D Mark IV, 24mm, f/8, 1/250s, ISO 100, 2019";
    const pano = await generateImageFal(newPrompt);
    if (pano) setSceneImg(pano);
    setFetching(false);
  };

  // Process the selected image
  const handleSelect = async (imgUrl: string) => {
    setPlaceholderVisible(true);
    setUpscaling(true);
    setUpscaledImg(imgUrl);
    setSpeciesAnalysis("");

    const upscaled = await creativeUpscale(imgUrl, {
      prompt: `You will be provided with an image of ${prompt}. Upscale the image, focusing on exotic birds, insects, small mammals, highly detailed, high resolution, sharp.`,
    });
    setUpscaledImg(upscaled);
    try {
      const base64 = await convertImageToBase64JPEG(upscaled);
      setBackpack([...backpack, base64]);

      const analysis = await getGeminiVision(
        `You will be provided with an image of ${prompt}. Identify and list the species of any creatures or plants present in the image. If no specific species can be identified, provide a general description of the types of creatures or plants visible.`,
        base64
      );

      const analysisScore = calculateScore(analysis);
      
      const scoreText = await getGroqCompletion(`Here is an analysis of a photo: ${analysis}. The score for this analysis is ${analysisScore}. Please return a JSON string in the following format: {species: string, score: number}`, 128,  "", true);

      const scoreJSON = JSON.parse(scoreText);
      setScore(prevScore => prevScore + scoreJSON.score);
      setSpeciesAnalysis(analysis);
      setDiscoveries(prevDiscoveries => [...prevDiscoveries, analysis]);
    } catch (e) {
      console.error("error creating new pano", e);
    }

    setSelectCount(prevCount => prevCount + 1);
    setUpscaling(false);

    if (selectCount === 1) {
      setSelectCount(0);
      const currentIndex = prompts.indexOf(prompt);
      if (currentIndex < prompts.length - 1) {
        setPrompt(prompts[currentIndex + 1]);
        setPlaceholderVisible(false);
        setUpscaledImg("");
        setSpeciesAnalysis("");
      } else {
        handleSaveScore();
      }
    }
  };

  //save score
  const handleSaveScore = async () => {
    const playerName = localStorage.getItem("playerName");
    if (playerName) {
      await saveScore(playerName, score);
    }
    setShowEndPage(true);
  };

  function calculateScore(analysis: string): number {
    const animalKeywords = ["bird", "animal", "mammal", "insect"];
    const absenceKeywords = ["no birds", "no animals", "no mammals", "no insects", "no exotic birds", "no exotic animals", "no exotic mammals", "no exotic insects"];

    const hasAnimal = animalKeywords.some(keyword => analysis.toLowerCase().includes(keyword));
    const hasAbsence = absenceKeywords.some(keyword => analysis.toLowerCase().includes(keyword));

    let score = 0;
    if (hasAnimal && !hasAbsence) {
      score += 5; // Initial 5 points if animals are mentioned and their absence is not indicated
    }

    // Find and score species marked with **
    const speciesMatches = analysis.match(/\*\*([^*]+)\*\*/g);
    if (speciesMatches) {
      const uniqueSpecies = new Set(speciesMatches.map(match => match.toLowerCase()));
      score += uniqueSpecies.size * 5; // 5 points for each unique species
    }

    return score;
  }

  return (
    <>
      <audio ref={audioRef} loop />
      <main className="flex flex-col w-full h-screen min-h-screen font-serif text-xl mb-2 rounded">
        <div className="flex justify-between gap-4 m-2">
          <button
            disabled={fetching}
            className="p-2 w-full rounded bg-white "
            onClick={handleCreate}
          >
            {fetching ? "Exploring..." : "Explore new place"}
          </button>
        </div>
        <div className="relative w-full h-full">
          <Panorama img={sceneImg} onSelect={handleSelect} immersive={true} />
          <div className="absolute top-0 left-0 p-4 flex flex-col max-w-sm">
            <p className="bg-white p-2">{description}</p>
            <div className="relative bg-white w-full h-64 rounded">
              {placeholderVisible && (
                <>
                  {upscaledImg ? (
                    <>
                      <img className="w-full h-full object-cover rounded" src={upscaledImg} />
                      {speciesAnalysis && (
                        <div className="p-2 bg-white/50">
                          <p>{speciesAnalysis}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex justify-center items-center">
                      <Spinner />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="fixed top-16 left-1/2 transform -translate-x-1/2 p-2 bg-white rounded">
            <p>Score: {score}</p>
            <p>Time Left: {countdown}s</p>
          </div>
          <button
            className="absolute top-0 right-0 m-4 p-2 bg-white rounded"
            onClick={() => setShowBackpack(!showBackpack)}
          >
            Photo Album ({backpack.length})
          </button>
          {showBackpack && (
            <div
              ref={backpackRef}
              className="fixed top-0 right-0 bottom-0 w-1/2 p-6 bg-white shadow-lg overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-6">Album</h2>
              <div className="grid grid-cols-2 gap-6">
                {backpack.map((img, index) => (
                  <div key={index} className="w-full h-64 overflow-hidden">
                    <img
                      src={img}
                      alt={`Backpack item ${index}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            className="absolute bottom-0 right-0 m-4 p-2 bg-white rounded"
            onClick={() => setShowDiscoveries(!showDiscoveries)}
          >
            Discovered Place ({discoveries.length})
          </button>
          {showDiscoveries && (
            <div
              ref={discoveriesRef}
              className="absolute bottom-0 right-0 m-4 p-4 bg-white rounded shadow-lg"
            >
              <h2 className="text-xl font-bold mb-4">Discovered Place</h2>
              <ul>
                {discoveries.map((discovery, index) => (
                  <li key={index}>
                    {discovery.split('.')[0]}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
      {showEndPage && (
        <EndPage
          playerName={localStorage.getItem("playerName") || ""}
          score={score}
          backpack={backpack}
          onClose={() => setShowEndPage(false)}
        />
      )}
    </>
  );
}

async function convertImageToBase64JPEG(url: string) {
  try {
    const img = new Image();
    img.src = url;
    img.crossOrigin = "anonymous";
    return new Promise<string>((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        const jpegBase64 = canvas.toDataURL("image/jpeg");
        resolve(jpegBase64);
      };

      img.onerror = (error) => {
        reject(error);
      };
    });
  } catch (error) {
    console.error("Error converting image:", error);
    throw error;
  }
}