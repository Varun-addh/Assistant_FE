
import React from 'react';
import ArchitectureGenerator from '@/components/ArchitectureGenerator';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ArchitecturePage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/')}
                            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                        >
                            <ArrowLeft className="w-5 h-5 mr-1" />
                            Back
                        </Button>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                            System Architecture AI
                        </h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="py-8">
                <ArchitectureGenerator
                    onGenerated={(pkg) => {
                        console.log('Architecture generated:', pkg.system_name);
                    }}
                />
            </main>
        </div>
    );
};

export default ArchitecturePage;
